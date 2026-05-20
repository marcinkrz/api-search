"use client";

import React, { useState, useEffect, useRef } from "react";
import { Info, Download, Upload, LogOut, ChevronUp, ChevronDown } from "lucide-react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

type Firm = {
  id: string;
  nazwa: string;
  nip: string;
  nipSc?: string;
  regon: string;
  adresDzialalnosci?: {
    ulica?: string;
    miasto?: string;
    wojewodztwo?: string;
    powiat?: string;
    gmina?: string;
    kod?: string;
  };
};

type PKDData = {
  kod: string;
  nazwa: string;
};

type AppState = {
  version: 1;
  filters: Record<string, string>;
  rows: Firm[];
  selectedRowIds: string[];
  pkdCache: Record<string, PKDData>;
  requestTimestamps: number[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  searchLinks: { next?: string; last?: string };
};

const INITIAL_STATE: AppState = {
  version: 1,
  filters: {},
  rows: [],
  selectedRowIds: [],
  pkdCache: {},
  requestTimestamps: [],
  currentPage: 1,
  totalPages: 0,
  totalCount: 0,
  searchLinks: {},
};

const REQUEST_LIMIT = 1000;
const WINDOW_MS = 60 * 60 * 1000;

export default function ClientApp() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingPKD, setIsFetchingPKD] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ceidg_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.version === 1) setState(parsed);
      } catch (e) { }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("ceidg_state", JSON.stringify(state));
  }, [state]);

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const getValidTimestamps = (timestamps: number[]) => {
    const now = Date.now();
    return timestamps.filter((t) => now - t < WINDOW_MS);
  };

  const checkBudget = (cost: number) => {
    const valid = getValidTimestamps(state.requestTimestamps);
    return valid.length + cost <= REQUEST_LIMIT;
  };

  const recordRequest = () => {
    updateState({ requestTimestamps: [...getValidTimestamps(state.requestTimestamps), Date.now()] });
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleFilterChange = (key: string, value: string) => {
    updateState({ filters: { ...state.filters, [key]: value } });
  };

  const hasFilters = Object.values(state.filters).some((v) => v.trim() !== "");

  const buildQueryString = (filters: Record<string, string>, page?: number) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      const trimmed = val.trim();
      if (trimmed) {
        const values = trimmed.split(",").map(v => v.trim());
        values.forEach(v => params.append(key, v));
      }
    });
    if (page) params.append("page", page.toString());
    return params.toString();
  };

  const executeSearch = async (isLoadMore = false) => {
    if (!checkBudget(1)) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const nextPage = isLoadMore ? state.currentPage + 1 : 1;
    if (isLoadMore) setIsLoadingMore(true);
    else setIsSearching(true);

    try {
      recordRequest();
      const query = buildQueryString(state.filters, nextPage);
      const res = await fetch(`/api/ceidg/search?${query}`, { signal: abortControllerRef.current.signal });
      if (!res.ok) throw new Error("API Limit or Error");

      const data = await res.json();

      let totalPagesComputed = state.totalPages;
      if (!isLoadMore) {
        if (data.links?.last) {
          const lastUrl = new URL(data.links.last);
          totalPagesComputed = parseInt(lastUrl.searchParams.get("page") || "1", 10);
        } else {
          totalPagesComputed = 1;
        }
      }

      updateState({
        rows: isLoadMore ? [...state.rows, ...(data.firmy || [])] : (data.firmy || []),
        currentPage: nextPage,
        totalPages: totalPagesComputed,
        totalCount: data.count || state.totalCount,
        searchLinks: data.links || {},
        selectedRowIds: isLoadMore ? state.selectedRowIds : [],
      });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error(e);
      }
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  };

  const fetchPKDForSelected = async () => {
    setIsFetchingPKD(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const nipsToFetch = state.selectedRowIds
      .map(id => state.rows.find(r => r.id === id)?.nip)
      .filter((nip): nip is string => !!nip && !state.pkdCache[nip]);

    let cacheUpdates: Record<string, PKDData> = {};

    for (const nip of nipsToFetch) {
      if (!checkBudget(1)) break;

      try {
        recordRequest();
        const res = await fetch(`/api/ceidg/pkd?nip=${nip}`, { signal: abortControllerRef.current.signal });
        if (!res.ok) break;

        const data = await res.json();
        if (data.firma?.pkdGlowny) {
          cacheUpdates[nip] = {
            kod: data.firma.pkdGlowny.kod,
            nazwa: data.firma.pkdGlowny.nazwa,
          };
          updateState({ pkdCache: { ...state.pkdCache, ...cacheUpdates } });
        }
      } catch (e: any) {
        if (e.name === "AbortError") break;
      }
    }
    setIsFetchingPKD(false);
  };

  const exportToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Firmy");

    ws.columns = [
      { header: "Nazwa firmy", key: "nazwa" },
      { header: "NIP", key: "nip" },
      { header: "NIP SC", key: "nipSc" },
      { header: "Regon", key: "regon" },
      { header: "Ulica", key: "ulica" },
      { header: "Miasto", key: "miasto" },
      { header: "Wojewodztwo", key: "wojewodztwo" },
      { header: "Powiat", key: "powiat" },
      { header: "Gmina", key: "gmina" },
      { header: "Kod pocztowy", key: "kod" },
      { header: "Kod PKD", key: "pkd" },
    ];

    const selectedRows = state.rows.filter(r => state.selectedRowIds.includes(r.id));
    selectedRows.forEach((r) => {
      const pkd = r.nip ? state.pkdCache[r.nip]?.kod : "";
      ws.addRow({
        nazwa: r.nazwa,
        nip: r.nip,
        nipSc: r.nipSc || "",
        regon: r.regon,
        ulica: r.adresDzialalnosci?.ulica || "",
        miasto: r.adresDzialalnosci?.miasto || "",
        wojewodztwo: r.adresDzialalnosci?.wojewodztwo || "",
        powiat: r.adresDzialalnosci?.powiat || "",
        gmina: r.adresDzialalnosci?.gmina || "",
        kod: r.adresDzialalnosci?.kod || "",
        pkd: pkd,
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const dateStr = new Date().toISOString().split("T")[0];
    saveAs(blob, `api-search_${dateStr}.xlsx`);
  };

  const downloadState = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    saveAs(blob, `ceidg_state_${new Date().toISOString().split("T")[0]}.json`);
  };

  const uploadState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.version === 1) setState(parsed);
      } catch (err) {
        alert("Błąd pliku.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const toggleSelectAll = () => {
    if (state.selectedRowIds.length === state.rows.length && state.rows.length > 0) {
      updateState({ selectedRowIds: [] });
    } else {
      updateState({ selectedRowIds: state.rows.map((r) => r.id) });
    }
  };

  const toggleSelectRow = (id: string) => {
    const current = new Set(state.selectedRowIds);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    updateState({ selectedRowIds: Array.from(current) });
  };

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig?.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortedRows = () => {
    if (!sortConfig) return state.rows;
    return [...state.rows].sort((a, b) => {
      let valA = "";
      let valB = "";

      switch (sortConfig.key) {
        case "nazwa": valA = a.nazwa; valB = b.nazwa; break;
        case "nip": valA = a.nip; valB = b.nip; break;
        case "nipSc": valA = a.nipSc || ""; valB = b.nipSc || ""; break;
        case "regon": valA = a.regon; valB = b.regon; break;
        case "ulica": valA = a.adresDzialalnosci?.ulica || ""; valB = b.adresDzialalnosci?.ulica || ""; break;
        case "miasto": valA = a.adresDzialalnosci?.miasto || ""; valB = b.adresDzialalnosci?.miasto || ""; break;
        case "wojewodztwo": valA = a.adresDzialalnosci?.wojewodztwo || ""; valB = b.adresDzialalnosci?.wojewodztwo || ""; break;
        case "powiat": valA = a.adresDzialalnosci?.powiat || ""; valB = b.adresDzialalnosci?.powiat || ""; break;
        case "gmina": valA = a.adresDzialalnosci?.gmina || ""; valB = b.adresDzialalnosci?.gmina || ""; break;
        case "kod": valA = a.adresDzialalnosci?.kod || ""; valB = b.adresDzialalnosci?.kod || ""; break;
        case "pkd":
          valA = a.nip && state.pkdCache[a.nip] ? state.pkdCache[a.nip].kod : "";
          valB = b.nip && state.pkdCache[b.nip] ? state.pkdCache[b.nip].kod : "";
          break;
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  };

  const nipsMissingPKD = state.selectedRowIds.filter(id => {
    const row = state.rows.find(r => r.id === id);
    return row?.nip && !state.pkdCache[row.nip];
  }).length;

  const validRequestsCount = getValidTimestamps(state.requestTimestamps).length;
  const availableBudget = Math.max(0, REQUEST_LIMIT - validRequestsCount);

  const pendingOperationCost = isFetchingPKD ? nipsMissingPKD : 1;
  const isBudgetWarning = availableBudget < pendingOperationCost;

  // MAX RECORDS LIMIT WARNING - keep this logic easy to find
  const showLimitWarning = validRequestsCount >= REQUEST_LIMIT || (isBudgetWarning && pendingOperationCost > 1);

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return null;
    return sortConfig.direction === "asc" ? <ChevronUp className="inline w-4 h-4" /> : <ChevronDown className="inline w-4 h-4" />;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">CEiDG Wyszukiwarka</h1>
        <div className="flex gap-4 items-center">
          <div className="text-sm font-medium text-gray-600">
            Limit API: <span className={availableBudget < 100 ? "text-red-600" : "text-green-600"}>{availableBudget}</span> / {REQUEST_LIMIT}
          </div>
          <button onClick={downloadState} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 tooltip" title="Pobierz stan">
            <Download size={18} />
          </button>
          <label className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 cursor-pointer" title="Wczytaj stan">
            <Upload size={18} />
            <input type="file" accept=".json" onChange={uploadState} className="hidden" />
          </label>
          <button onClick={handleLogout} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700" title="Wyloguj">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {showLimitWarning && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="font-semibold text-yellow-800">Osiągnięto limit zapytań (Dokończ później)</h3>
            <p className="text-sm text-yellow-700">Wyczerpano budżet {REQUEST_LIMIT} zapytań na godzinę. Zapisz obecny stan i dokończ później.</p>
          </div>
          <button onClick={downloadState} className="shrink-0 bg-yellow-100 text-yellow-800 px-4 py-2 rounded font-medium hover:bg-yellow-200 border border-yellow-300">
            Pobierz plik ze stanem
          </button>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
          {["nip", "regon", "nip_sc", "regon_sc", "nazwa", "ulica", "miasto", "wojewodztwo", "powiat", "gmina", "kod"].map((field) => (
            <input
              key={field}
              type="text"
              placeholder={field.replace("_", " ")}
              value={state.filters[field] || ""}
              onChange={(e) => handleFilterChange(field, e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ))}
          <select
            value={state.filters.status || ""}
            onChange={(e) => handleFilterChange("status", e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Wybierz status...</option>
            <option value="AKTYWNY">AKTYWNY</option>
            <option value="WYKRESLONY">WYKRESLONY</option>
            <option value="ZAWIESZONY">ZAWIESZONY</option>
            <option value="OCZEKUJE_NA_ROZPOCZECIE_DZIALANOSCI">OCZEKUJE NA ROZPOCZECIE DZIALANOSCI</option>
            <option value="WYLACZNIE_W_FORMIE_SPOLKI">WYLACZNIE W FORMIE SPOLKI</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => executeSearch()}
            disabled={!hasFilters || isSearching || availableBudget < 1}
            className={`px-6 py-2 rounded font-medium text-white transition-colors ${hasFilters && !isSearching && availableBudget >= 1 ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
              }`}
          >
            {isSearching ? "Szukanie..." : "Szukaj"}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-sm text-gray-600 space-x-4">
          <span>Znaleziono firm: <strong>{state.totalCount}</strong></span>
          <span>Liczba stron: <strong>{state.totalPages}</strong></span>
          {state.totalPages > 0 && <span>Pobrano: <strong>{state.currentPage}</strong> / {state.totalPages}</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPKDForSelected}
            disabled={state.selectedRowIds.length === 0 || isFetchingPKD || availableBudget < 1}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            {isFetchingPKD ? "Pobieranie..." : "Pobierz PKD"}
          </button>
          <button
            onClick={exportToExcel}
            disabled={state.selectedRowIds.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            Eksportuj
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={state.selectedRowIds.length === state.rows.length && state.rows.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("nazwa")}>Nazwa firmy <SortIcon column="nazwa" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("nip")}>NIP <SortIcon column="nip" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("nipSc")}>NIP SC <SortIcon column="nipSc" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("regon")}>Regon <SortIcon column="regon" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("ulica")}>Ulica <SortIcon column="ulica" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("miasto")}>Miasto <SortIcon column="miasto" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("wojewodztwo")}>Wojewodztwo <SortIcon column="wojewodztwo" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("powiat")}>Powiat <SortIcon column="powiat" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("gmina")}>Gmina <SortIcon column="gmina" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("kod")}>Kod pocztowy <SortIcon column="kod" /></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("pkd")}>Kod PKD <SortIcon column="pkd" /></th>
              </tr>
            </thead>
            <tbody>
              {getSortedRows().map((row) => (
                <tr key={row.id} className={`border-b hover:bg-gray-50 ${state.selectedRowIds.includes(row.id) ? "bg-blue-50" : ""}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={state.selectedRowIds.includes(row.id)} onChange={() => toggleSelectRow(row.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate" title={row.nazwa}>{row.nazwa}</td>
                  <td className="px-4 py-3">{row.nip}</td>
                  <td className="px-4 py-3">{row.nipSc}</td>
                  <td className="px-4 py-3">{row.regon}</td>
                  <td className="px-4 py-3">{row.adresDzialalnosci?.ulica}</td>
                  <td className="px-4 py-3">{row.adresDzialalnosci?.miasto}</td>
                  <td className="px-4 py-3">{row.adresDzialalnosci?.wojewodztwo}</td>
                  <td className="px-4 py-3">{row.adresDzialalnosci?.powiat}</td>
                  <td className="px-4 py-3">{row.adresDzialalnosci?.gmina}</td>
                  <td className="px-4 py-3">{row.adresDzialalnosci?.kod}</td>
                  <td className="px-4 py-3">
                    {row.nip && state.pkdCache[row.nip] ? (
                      <div className="flex items-center gap-2 relative group">
                        <span>{state.pkdCache[row.nip].kod}</span>
                        <Info size={16} className="text-gray-400 cursor-help" />
                        <div className="absolute hidden group-hover:block bottom-full mb-2 bg-gray-800 text-white text-xs rounded px-2 py-1 z-50 whitespace-normal w-48 shadow-lg">
                          {state.pkdCache[row.nip].nazwa}
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {state.rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                    Brak danych. Rozpocznij wyszukiwanie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {state.currentPage < state.totalPages && (
        <div className="flex justify-center mt-4 pb-12">
          <button
            onClick={() => executeSearch(true)}
            disabled={isLoadingMore || availableBudget < 1}
            className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors shadow-sm"
          >
            {isLoadingMore ? "Wczytywanie..." : "Wczytaj kolejną partię (25 rekordów)"}
          </button>
        </div>
      )}
    </div>
  );
}

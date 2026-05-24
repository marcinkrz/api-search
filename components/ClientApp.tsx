"use client";

import React, { useState, useEffect, useRef } from "react";
import { Info, FileDown, FileUp, TriangleAlert, LogOut, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";

type Firm = {
  id: string;
  nazwa: string;
  nipSc?: string;
  wlasciciel?: {
    imie?: string;
    nazwisko?: string;
    nip?: string;
    regon?: string;
  };
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
  firstPageFetchTime: number; // in ms
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
  firstPageFetchTime: 0,
};

const REQUEST_LIMIT = 1000;
const WINDOW_MS = 60 * 60 * 1000;

export default function ClientApp() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingPKD, setIsFetchingPKD] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFetchingAll, setIsFetchingAll] = useState(false);
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

  const executeSearch = async (isLoadMore = false, targetPage?: number) => {
    if (!checkBudget(1)) return false;

    if (!isLoadMore && abortControllerRef.current) abortControllerRef.current.abort();
    if (!isLoadMore) abortControllerRef.current = new AbortController();

    const nextPage = targetPage || (isLoadMore ? state.currentPage + 1 : 1);
    if (isLoadMore) setIsLoadingMore(true);
    else setIsSearching(true);

    const startTime = Date.now();

    try {
      recordRequest();
      const query = buildQueryString(state.filters, nextPage);
      const res = await fetch(`/api/ceidg/search?${query}`, {
        signal: abortControllerRef.current?.signal
      });
      if (!res.ok) throw new Error("API Limit or Error");

      const data = await res.json();
      const elapsed = Date.now() - startTime;

      let totalPagesComputed = state.totalPages;
      if (!isLoadMore && !targetPage) {
        if (data.links?.last) {
          const lastUrl = new URL(data.links.last);
          totalPagesComputed = parseInt(lastUrl.searchParams.get("page") || "1", 10);
        } else {
          totalPagesComputed = 1;
        }
      }

      setState((prev) => ({
        ...prev,
        rows: isLoadMore || targetPage ? [...prev.rows, ...(data.firmy || [])] : (data.firmy || []),
        currentPage: nextPage,
        totalPages: totalPagesComputed,
        totalCount: data.count || prev.totalCount,
        searchLinks: data.links || {},
        selectedRowIds: isLoadMore || targetPage ? prev.selectedRowIds : [],
        firstPageFetchTime: !isLoadMore && !targetPage ? elapsed : prev.firstPageFetchTime,
      }));
      return true;
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error(e);
      }
      return false;
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  };

  const fetchAllPages = async () => {
    setIsFetchingAll(true);
    let currentPageNum = state.currentPage;
    while (currentPageNum < state.totalPages) {
      if (!checkBudget(1)) break;
      const success = await executeSearch(true, currentPageNum + 1);
      if (!success) break;
      currentPageNum++;
    }
    setIsFetchingAll(false);
  };

  const fetchPKDForSelected = async () => {
    setIsFetchingPKD(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const nipsToFetch = state.selectedRowIds
      .map(id => state.rows.find(r => r.id === id)?.wlasciciel?.nip)
      .filter((nip): nip is string => !!nip && !state.pkdCache[nip]);

    for (const nip of nipsToFetch) {
      if (!checkBudget(1)) break;

      try {
        recordRequest();
        const res = await fetch(`/api/ceidg/pkd?nip=${nip}`, { signal: abortControllerRef.current.signal });

        if (!res.ok) {
          console.error(`Błąd API dla NIP: ${nip}`, res.status);
          break;
        }

        const data = await res.json();

        if (data.firma && data.firma.length > 0 && data.firma[0].pkdGlowny) {

          const cacheUpdate = {
            [nip]: {
              kod: data.firma[0].pkdGlowny.kod,
              nazwa: data.firma[0].pkdGlowny.nazwa,
            }
          };

          setState((prev) => ({
            ...prev,
            pkdCache: { ...prev.pkdCache, ...cacheUpdate }
          }));
        }

        await new Promise(resolve => setTimeout(resolve, 300));

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
      const nip = r.wlasciciel?.nip || "";
      const pkd = nip ? state.pkdCache[nip]?.kod : "";
      ws.addRow({
        nazwa: r.nazwa,
        nip: nip,
        nipSc: r.nipSc || "",
        regon: r.wlasciciel?.regon || "",
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
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: "asc" };
      }
      if (current.direction === "asc") {
        return { key, direction: "desc" };
      }
      return null;
    });
  };

  const getSortedRows = () => {
    if (!sortConfig) return state.rows;

    const collator = new Intl.Collator('pl', {
      numeric: true,
      sensitivity: 'base',
    });

    return [...state.rows].sort((a, b) => {
      let valA = "";
      let valB = "";

      switch (sortConfig.key) {
        case "nazwa": valA = a.nazwa; valB = b.nazwa; break;
        case "nip": valA = a.wlasciciel?.nip || ""; valB = b.wlasciciel?.nip || ""; break;
        case "nipSc": valA = a.nipSc || ""; valB = b.nipSc || ""; break;
        case "regon": valA = a.wlasciciel?.regon || ""; valB = b.wlasciciel?.regon || ""; break;
        case "ulica": valA = a.adresDzialalnosci?.ulica || ""; valB = b.adresDzialalnosci?.ulica || ""; break;
        case "miasto": valA = a.adresDzialalnosci?.miasto || ""; valB = b.adresDzialalnosci?.miasto || ""; break;
        case "wojewodztwo": valA = a.adresDzialalnosci?.wojewodztwo || ""; valB = b.adresDzialalnosci?.wojewodztwo || ""; break;
        case "powiat": valA = a.adresDzialalnosci?.powiat || ""; valB = b.adresDzialalnosci?.powiat || ""; break;
        case "gmina": valA = a.adresDzialalnosci?.gmina || ""; valB = b.adresDzialalnosci?.gmina || ""; break;
        case "kod": valA = a.adresDzialalnosci?.kod || ""; valB = b.adresDzialalnosci?.kod || ""; break;
        case "pkd":
          valA = a.wlasciciel?.nip && state.pkdCache[a.wlasciciel.nip] ? state.pkdCache[a.wlasciciel.nip].kod : "";
          valB = b.wlasciciel?.nip && state.pkdCache[b.wlasciciel.nip] ? state.pkdCache[b.wlasciciel.nip].kod : "";
          break;
      }

      const comparison = collator.compare(valA, valB);

      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  };

  const nipsMissingPKD = state.selectedRowIds.filter(id => {
    const row = state.rows.find(r => r.id === id);
    return row?.wlasciciel?.nip && !state.pkdCache[row.wlasciciel.nip];
  }).length;

  const validRequestsCount = getValidTimestamps(state.requestTimestamps).length;
  const availableBudget = Math.max(0, REQUEST_LIMIT - validRequestsCount);

  const pendingOperationCost = isFetchingPKD ? nipsMissingPKD : 1;
  const isBudgetWarning = availableBudget < pendingOperationCost;

  // MAX RECORDS LIMIT WARNING - keep this logic easy to find
  const showLimitWarning = validRequestsCount >= REQUEST_LIMIT || (isBudgetWarning && pendingOperationCost > 1);

  const estimatedTotalTimeSeconds = state.firstPageFetchTime > 0
    ? ((state.firstPageFetchTime * (state.totalPages - state.currentPage)) / 1000).toFixed(1)
    : "0.0";

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) {
      return <ChevronsUpDown className="inline w-4 h-4" />;
    }
    return sortConfig.direction === "asc" ? <ChevronUp className="inline w-4 h-4" /> : <ChevronDown className="inline w-4 h-4" />;
  };

  const fieldLabels: Record<string, string> = {
    pkd: "Kod PKD (0000Z)",
    nazwa: "Nazwa",
    ulica: "Ulica",
    miasto: "Miasto",
    wojewodztwo: "Wojewodztwo",
    powiat: "Powiat",
    gmina: "Gmina",
    kod: "Kod pocztowy"
  };

  return (
    <>
      <div className="flex justify-between items-center py-4">
        <h1 className="h3">API Search</h1>
        <div className="flex gap-2 items-center">
          <div className="text-sm text-[var(--muted)] leading-[1.1]">
            Limit API:<br /><span className={availableBudget < 100 ? "text-[var(--danger-text)]" : "text-[var(--foreground)]"}>{availableBudget}</span> / {REQUEST_LIMIT}
          </div>
          <Button onClick={downloadState} variant="outline" size="icon">
            <FileDown size={16} />
            <span className="hidden md:flex mx-2 text-sm">Pobierz stan</span>
          </Button>
          <label className="cursor-pointer inline-flex justify-center items-center leading-none tracking-wide whitespace-nowrap border transition-colors min-w-[2rem] p-1 rounded-lg bg-transparent border-[var(--border)] text-[var(--foreground-1)] hover:border-[var(--foreground)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] focus-visible:border-transparent active:border-[var(--foreground)] active:text-[var(--foreground)]">
            <FileUp size={16} />
            <span className="hidden md:flex mx-2 text-sm">Wczytaj stan</span>
            <input type="file" accept=".json" onChange={uploadState} className="hidden" />
          </label>
          <Button onClick={handleLogout} variant="outline" size="icon" className="" title="Wyloguj">
            <LogOut size={16} />
            <span className="hidden md:flex mx-2 text-sm">Wyloguj</span>
          </Button>
        </div>
      </div>

      {showLimitWarning && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4 p-4 bg-[var(--warning-bg)] border-l-4 border-[var(--warning-border)] rounded-r-lg">
          <div className="grid grid-cols-[auto_1fr] gap-4 items-center text-[var(--warning-text)]">
            <TriangleAlert size={32} />
            <div>
              <h3 className="font-semibold">Dokończ później, osiągnięto limit zapytań</h3>
              <p className="text-sm">Wyczerpano budżet {REQUEST_LIMIT} zapytań na godzinę. Zapisz obecny stan i dokończ później.</p>
            </div>
          </div>
          <Button onClick={downloadState} variant="primary">Pobierz plik ze stanem</Button>
        </div>
      )}

      <div className="p-2 rounded-lg border border-[var(--border-light)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
          {["nazwa", "pkd", "ulica", "miasto", "wojewodztwo", "powiat", "gmina", "kod"].map((field) => (
            <input
              key={field}
              type="text"
              placeholder={fieldLabels[field]}
              value={state.filters[field] || ""}
              onChange={(e) => handleFilterChange(field, e.target.value)}
              className="flex w-full outline-0 ring-0 ring-[var(--focus)] border border-[var(--border)] rounded-lg focus-visible:border-[var(--focus)] focus-visible:ring-1 active:border-[var(--focus)] active:ring-1 px-4 placeholder:text-[var(--muted)]"
            />
          ))}
          <select
            value={state.filters.status || ""}
            onChange={(e) => handleFilterChange("status", e.target.value)}
            className="flex w-full outline-0 ring-0 ring-[var(--focus)] border border-[var(--border)] rounded-lg focus-visible:border-[var(--focus)] focus-visible:ring-1 active:border-[var(--focus)] active:ring-1 px-4 placeholder:text-[var(--muted)]"
          >
            <option value="">Wybierz status...</option>
            <option value="AKTYWNY">Aktywny</option>
            <option value="WYKRESLONY">Wykreślony</option>
            <option value="ZAWIESZONY">Zawieszony</option>
            <option value="OCZEKUJE_NA_ROZPOCZECIE_DZIALANOSCI">Oczekuje na rozpoczęcie działalności</option>
            <option value="WYLACZNIE_W_FORMIE_SPOLKI">Wyłącznie w formie spółki</option>
          </select>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => executeSearch()}
            disabled={!hasFilters || isSearching || availableBudget < 1}
            variant="primary"
            className="w-full"
          >
            {isSearching ? "Szukanie..." : "Szukaj firm"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-2 my-4">
        <div className="flex flex-col md:flex-row gap-x-4 text-sm text-[var(--muted)] md:items-end">
          <span>Znaleziono firm: <strong className="text-[var(--foreground)]">{state.totalCount}</strong></span>
          {state.totalPages > 0 && (
            <span>Pobrano: <strong className="text-[var(--foreground)]">{state.currentPage}</strong> z {state.totalPages} stron</span>
          )}
          {state.totalPages > state.currentPage && (
            <span>Szacowany czas: <strong className="text-[var(--foreground)]">{estimatedTotalTimeSeconds}s</strong></span>
          )}
        </div>
        <div className="grid grid-cols-2 md:flex gap-2 md:items-start">
          {state.currentPage < state.totalPages && state.totalPages > 0 && (
            <Button
              onClick={fetchAllPages}
              variant="outline"
              size="small"
              className="col-span-2"
              disabled={isFetchingAll || availableBudget < 1}
            >
              {isFetchingAll ? "Pobieranie..." : "Pobierz wszystkie"}
            </Button>
          )}
          <Button
            onClick={fetchPKDForSelected}
            variant="outline"
            size="small"
            disabled={state.selectedRowIds.length === 0 || isFetchingPKD || availableBudget < 1}
          >
            {isFetchingPKD ? "Pobieranie..." : "Pobierz PKD"}
          </Button>
          <Button
            onClick={exportToExcel}
            variant="outline"
            size="small"
            disabled={state.selectedRowIds.length === 0}
          >
            Eksportuj
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border-light)] overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-[var(--muted)] uppercase sticky top-0 z-10">
              <tr className="relative after:absolute after:top-0 after:inset-x-0 after:h-[41px] after:bg-[var(--border-light)] after:-z-1">
                <th className="flex justify-center p-3 bg-[var(--background-1)]">
                  <Checkbox name="select-all" checked={state.selectedRowIds.length === state.rows.length && state.rows.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-x-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("nazwa")}>
                  <span className="flex gap-x-2 justify-between">Nazwa firmy <SortIcon column="nazwa" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("nip")}>
                  <span className="flex gap-x-2 justify-between">NIP <SortIcon column="nip" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("nipSc")}>
                  <span className="flex gap-x-2 justify-between">NIP SC <SortIcon column="nipSc" /></span>
                </th>
                <th className="p-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("regon")}>
                  <span className="flex gap-x-2 justify-between">Regon <SortIcon column="regon" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("ulica")}>
                  <span className="flex gap-x-2 justify-between">Ulica <SortIcon column="ulica" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("miasto")}>
                  <span className="flex gap-x-2 justify-between">Miasto <SortIcon column="miasto" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("wojewodztwo")}>
                  <span className="flex gap-x-2 justify-between">Województwo <SortIcon column="wojewodztwo" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("powiat")}>
                  <span className="flex gap-x-2 justify-between">Powiat <SortIcon column="powiat" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("gmina")}>
                  <span className="flex gap-x-2 justify-between">Gmina <SortIcon column="gmina" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("kod")}>
                  <span className="flex gap-x-2 justify-between">Kod pocztowy <SortIcon column="kod" /></span>
                </th>
                <th className="px-2 py-3 bg-[var(--background-1)] border-l-1 border-[var(--border-light)] cursor-pointer hover:bg-[var(--background-2)]" onClick={() => handleSort("pkd")}>
                  <span className="flex gap-x-2 justify-between">Kod PKD <SortIcon column="pkd" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {getSortedRows().map((row) => {
                const rowNip = row.wlasciciel?.nip || "";
                return (
                  <tr key={row.id} className={`border-b border-[var(--border-light)] hover:bg-[var(--info-bg)] ${state.selectedRowIds.includes(row.id) ? "bg-[var(--success-bg)]" : ""}`}>
                    <td className="p-3 w-12">
                      <span className="flex justify-center">
                        <Checkbox name="select-row" type="checkbox" checked={state.selectedRowIds.includes(row.id)} onChange={() => toggleSelectRow(row.id)} />
                      </span>
                    </td>
                    <td className="px-2 py-3 font-medium max-w-[250px] truncate" title={row.nazwa}>{row.nazwa}</td>
                    <td className="px-2 py-3 w-28">{rowNip}</td>
                    <td className="px-2 py-3 w-28">{row.nipSc || ""}</td>
                    <td className="px-2 py-3 w-28">{row.wlasciciel?.regon || ""}</td>
                    <td className="px-2 py-3">{row.adresDzialalnosci?.ulica || ""}</td>
                    <td className="px-2 py-3">{row.adresDzialalnosci?.miasto || ""}</td>
                    <td className="px-2 py-3">{row.adresDzialalnosci?.wojewodztwo || ""}</td>
                    <td className="px-2 py-3">{row.adresDzialalnosci?.powiat || ""}</td>
                    <td className="px-2 py-3">{row.adresDzialalnosci?.gmina || ""}</td>
                    <td className="px-2 py-3 w-36">{row.adresDzialalnosci?.kod || ""}</td>
                    <td className="px-2 py-3 w-24">
                      {rowNip && state.pkdCache[rowNip] ? (
                        <div className="relative flex items-center justify-between gap-x-2 group">
                          <span>{state.pkdCache[rowNip].kod}</span>
                          <Info size={16} className="text-[var(--muted)]" />
                          <div className="absolute hidden group-hover:block bottom-full -right-2 w-max mb-2 px-3 py-2 z-50 bg-[var(--foreground)] text-[var(--background)] text-sm rounded-md text-balance shadow-md before:absolute before:-bottom-[6px] before:right-[10px] before:border-l-6 before:border-r-6 before:border-t-6 before:border-l-transparent before:border-r-transparent before:border-t-[var(--foreground)]">
                            {state.pkdCache[rowNip].nazwa}
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {state.rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-[var(--muted)]">
                    Brak danych. Rozpocznij wyszukiwanie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {
        state.currentPage < state.totalPages && (
          <div className="flex justify-center mt-4 pb-12">
            <Button
              onClick={() => executeSearch(true)}
              variant="outline"
              disabled={isLoadingMore || availableBudget < 1}
            >
              {isLoadingMore ? "Wczytywanie..." : "Wczytaj kolejną partię (25 rekordów)"}
            </Button>
          </div>
        )
      }
    </>
  );
}

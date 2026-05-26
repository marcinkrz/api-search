import { useState, useEffect, useCallback, useRef, Dispatch, SetStateAction } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  validator?: (parsedData: any) => boolean
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(initialValue);
  const [isMounted, setIsMounted] = useState(false);

  const validatorRef = useRef(validator);
  useEffect(() => {
    validatorRef.current = validator;
  }, [validator]);

  useEffect(() => {
    setIsMounted(true);
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        if (!validatorRef.current || validatorRef.current(parsed)) {
          setState(parsed);
        }
      }
    } catch (error) {
      console.warn(`Błąd odczytu localStorage ("${key}"):`, error);
    }
  }, [key]);

  useEffect(() => {
    if (isMounted) {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.warn(`Błąd zapisu localStorage ("${key}"):`, error);
      }
    }
  }, [key, state, isMounted]);

  const clearValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setState(initialValue);
    } catch (error) {
      console.warn(`Błąd usuwania klucza ("${key}"):`, error);
    }
  }, [key, initialValue]);

  return [state, setState, clearValue];
}

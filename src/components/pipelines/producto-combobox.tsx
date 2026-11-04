"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Producto } from "@/hooks/use-productos";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatPrecio(p: Producto): string | null {
  if (!p.precioBase) return null;
  return `${p.precioBase.amount.toFixed(2)} ${p.precioBase.currencyCode}`;
}

interface ProductoComboboxProps {
  productos: Producto[];
  value: string;
  onChange: (productoId: string) => void;
  loading?: boolean;
  placeholder: string;
  emptyText: string;
  loadingText: string;
}

export function ProductoCombobox({
  productos,
  value,
  onChange,
  loading = false,
  placeholder,
  emptyText,
  loadingText,
}: ProductoComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => productos.find((p) => p.id === value) ?? null,
    [productos, value],
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return productos;
    return productos.filter((p) => normalize(p.name).includes(q));
  }, [productos, query]);

  // Cierra el dropdown al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const inputValue = open ? query : (selected?.name ?? "");

  function select(p: Producto) {
    onChange(p.id);
    setQuery(p.name);
    setOpen(false);
  }

  return (
    <div className="grid gap-2 relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={inputValue}
          disabled={loading}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => {
            setQuery(inputValue);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && open && filtered.length > 0) {
              e.preventDefault();
              select(filtered[0]);
            }
          }}
          placeholder={placeholder}
          className="border-border bg-muted pl-7 pr-7 text-foreground disabled:opacity-60"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted ${
                  p.id === value ? "bg-muted" : ""
                }`}
              >
                <span className="text-foreground">{p.name}</span>
                {formatPrecio(p) && (
                  <span className="text-xs text-muted-foreground">{formatPrecio(p)}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {loadingText}
        </p>
      )}
    </div>
  );
}
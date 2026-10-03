import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg } from "@/lib/queries";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "switch" | "color";
  options?: { value: string; label: string }[];
  placeholder?: string;
  half?: boolean;
  step?: string;
};

type Values = Record<string, unknown>;
const NONE = "__none";

export function EntityDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  fields: FieldDef[] | ((v: Values) => FieldDef[]);
  initial: Values;
  onSubmit: (v: Values) => Promise<void>;
  extra?: (v: Values, set: (k: string, v: unknown) => void) => ReactNode;
}) {
  const [values, setValues] = useState<Values>(props.initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (props.open) setValues(props.initial);
  }, [props.open, props.initial]);

  const fields = typeof props.fields === "function" ? props.fields(values) : props.fields;
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await props.onSubmit(values);
      toast.success("Tersimpan");
      props.onOpenChange(false);
    } catch (err) {
      toast.error("Gagal menyimpan", { description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{props.title}</DialogTitle>
          {props.description ? <DialogDescription>{props.description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          {fields.map((f) => {
            const v = values[f.name];
            return (
              <div key={f.name} className={f.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
                {f.type === "switch" ? (
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <span className="text-sm font-medium">{f.label}</span>
                    <Switch checked={!!v} onCheckedChange={(c) => set(f.name, c)} />
                  </label>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor={f.name}>{f.label}</Label>
                    {f.type === "select" ? (
                      <Select value={v == null || v === "" ? NONE : String(v)} onValueChange={(x) => set(f.name, x === NONE ? null : x)}>
                        <SelectTrigger id={f.name}>
                          <SelectValue placeholder={f.placeholder ?? "Pilih"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map((o) => (
                            <SelectItem key={o.value || NONE} value={o.value || NONE}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : f.type === "textarea" ? (
                      <Textarea id={f.name} value={(v as string) ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
                    ) : (
                      <Input
                        id={f.name}
                        type={f.type === "color" ? "color" : f.type}
                        inputMode={f.type === "number" ? "decimal" : undefined}
                        step={f.step ?? (f.type === "number" ? "any" : undefined)}
                        value={(v as string | number | undefined) ?? (f.type === "color" ? "#2f7d5b" : "")}
                        placeholder={f.placeholder}
                        onChange={(e) => set(f.name, e.target.value)}
                        className={f.type === "number" ? "num" : f.type === "color" ? "h-10 p-1" : undefined}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {props.extra ? <div className="col-span-2">{props.extra(values, set)}</div> : null}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const CURRENCY_OPTIONS = [
  { value: "IDR", label: "IDR — Rupiah" },
  { value: "USD", label: "USD — Dollar" },
];

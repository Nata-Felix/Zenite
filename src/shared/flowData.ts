import type { FlowTransformSpec } from "./types";

export interface DataItem { entrada: string; vars: Record<string, string> }
export const DATA_LIMIT = 1_000_000;

function jsonField(text: string, path: string): unknown {
  let value: unknown = JSON.parse(text);
  const field = path.replace(/^\$\.?/, "").replace(/\[(\d+)\]/g, ".$1");
  if (!field) return value;
  for (const part of field.split(".")) {
    if (!part || ["__proto__", "constructor", "prototype"].includes(part) || value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) throw new Error(`Campo JSON não encontrado: ${path}`);
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

const textOf = (value: unknown): string => typeof value === "string" ? value : JSON.stringify(value);

/** Substituição de texto, sem eval. {{json.cliente.nome}} lê um campo da entrada JSON. */
export function fillData(template: string, item: DataItem): string {
  let length = template.length;
  if (length > DATA_LIMIT) throw new Error("Texto maior que 1 MB.");
  const lower = new Map(Object.entries({ ...item.vars, entrada: item.entrada }).map(([key, value]) => [key.trim().toLowerCase(), value]));
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const name = key.trim();
    const value = name.startsWith("json.") ? textOf(jsonField(item.entrada, name.slice(5))) : lower.get(name.toLowerCase()) ?? "";
    length += value.length - _match.length;
    if (length > DATA_LIMIT) throw new Error("Resultado maior que 1 MB.");
    return value;
  });
}

export function jsonBody(template: string, item: DataItem): unknown {
  if (template.length > DATA_LIMIT || item.entrada.length > DATA_LIMIT) throw new Error("Dados maiores que 1 MB.");
  if (template.trim() === "{{entrada}}") return JSON.parse(item.entrada);
  const visit = (value: unknown): unknown => typeof value === "string" ? fillData(value, item) : Array.isArray(value) ? value.map(visit) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, content]) => [key, visit(content)])) : value;
  return visit(JSON.parse(template));
}

export function transformData(spec: FlowTransformSpec, item: DataItem): DataItem {
  if (item.entrada.length > DATA_LIMIT) throw new Error("Entrada maior que 1 MB.");
  let text: string;
  switch (spec.operation) {
    case "template": text = fillData(spec.value ?? "{{entrada}}", item); break;
    case "json-field": text = textOf(jsonField(item.entrada, spec.field ?? "")); break;
    case "json-format": text = JSON.stringify(JSON.parse(item.entrada), null, 2); break;
    case "replace": {
      const search = fillData(spec.search ?? "", item);
      if (!search) throw new Error("Informe o texto a substituir.");
      const replacement = fillData(spec.replacement ?? "", item);
      const parts = item.entrada.split(search);
      if (item.entrada.length + (parts.length - 1) * (replacement.length - search.length) > DATA_LIMIT) throw new Error("Resultado maior que 1 MB.");
      text = parts.join(replacement); break;
    }
    case "split": text = JSON.stringify(item.entrada.split(spec.separator ?? "\n")); break;
    case "join": {
      const list: unknown = JSON.parse(item.entrada);
      if (!Array.isArray(list)) throw new Error("A entrada precisa ser uma lista JSON.");
      text = list.map(textOf).join(spec.separator ?? "\n"); break;
    }
    case "set-variable": {
      const name = spec.variable?.trim() ?? "";
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || ["entrada", "__proto__", "constructor", "prototype"].includes(name.toLowerCase())) throw new Error("Escolha um nome válido para a variável, diferente de entrada.");
      const value = fillData(spec.value ?? "{{entrada}}", item);
      if (value.length > DATA_LIMIT) throw new Error("Variável maior que 1 MB.");
      return { ...item, vars: { ...item.vars, [name]: value } };
    }
    default: throw new Error("Transformação de dados desconhecida.");
  }
  if (text.length > DATA_LIMIT) throw new Error("Resultado maior que 1 MB.");
  return { entrada: text, vars: { ...item.vars, dados: text } };
}

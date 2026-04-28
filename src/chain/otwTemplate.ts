// OTW template bytecode — compiled from scripts/otw-template/sources/TEMPLATE.move
// (module template::TEMPLATE) via `sui move build`. 634 raw bytes.
// Updated identifier "TEMPLATE" appears as both module name and OTW witness
// struct name. Constant pool [0] = symbol bytes "TEMPLATE" (placeholder
// vector<u8>); [1] = "placeholder" (name + desc, deduped by Move compiler);
// [2] = "data:image/png;base64,placeholder" (icon).
//
// Re-emit with: `base64 -w 0 scripts/otw-template/build/template/bytecode_modules/TEMPLATE.mv`
// after rebuilding the template package.
export const OTW_TEMPLATE_BASE64 =
  "oRzrCwcAAAUKAQAMAgweAyohBEsIBVNaB60BwAEI7QJgBs0DQAqNBAUMkgQ6AAMBDgIGAgcCDwIQAAMCAAECBwACBAwBAAEDAAABAAEDAQwBAAEFBQIAAAoAAQABEQMEAAMJCAkBAAMLBgcBAgQMDQEBDAUNCgsAAwUCBQQMBA4CCAAHCAUAAgsEAQgACwIBCAABCgIBCAEBCAAHCQACCAEIAQgBCAEHCAUCCwMBCQALAgEJAAILAwEJAAcIBQELBAEJAAEGCAUBBQELAgEIAAIJAAUBCwQBCAATQ3VycmVuY3lJbml0aWFsaXplcgtNZXRhZGF0YUNhcAZTdHJpbmcIVEVNUExBVEULVHJlYXN1cnlDYXAJVHhDb250ZXh0BGNvaW4NY29pbl9yZWdpc3RyeQtkdW1teV9maWVsZAhmaW5hbGl6ZQRpbml0FW5ld19jdXJyZW5jeV93aXRoX290dw9wdWJsaWNfdHJhbnNmZXIGc2VuZGVyBnN0cmluZwh0cmFuc2Zlcgp0eF9jb250ZXh0BHV0ZjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIKAgkIVEVNUExBVEUKAgwLcGxhY2Vob2xkZXIKAiIhZGF0YTppbWFnZS9wbmc7YmFzZTY0LHBsYWNlaG9sZGVyAAIBCAEAAAAAAhsLADEJBwARAQcBEQEHAREBBwIRAQoBOAAMAwoBOAEMAgsDCgEuEQU4AgsCCwEuEQU4AwIAAA==";

// Decode the base64 template into a Uint8Array of raw bytecode bytes.
export function loadOtwTemplateBytes(): Uint8Array {
  const bin = atob(OTW_TEMPLATE_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

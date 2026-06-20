import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HostResolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

function ipv4Blocked(address: string) {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isBlockedAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return ipv4Blocked(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized.startsWith("::ffff:")) {
    return ipv4Blocked(normalized.replace("::ffff:", ""));
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8")
  );
}

export function normalizeWebsiteUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a website URL to analyze.");
  const candidate = new URL(
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
  );
  candidate.hash = "";
  return candidate;
}

const defaultResolver: HostResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export async function assertPublicWebsiteUrl(
  candidate: URL,
  resolver: HostResolver = defaultResolver,
) {
  if (!["http:", "https:"].includes(candidate.protocol)) {
    throw new Error("Use an http or https website URL.");
  }
  if (candidate.username || candidate.password) {
    throw new Error("URLs containing credentials are not supported.");
  }
  if (candidate.port && !["80", "443"].includes(candidate.port)) {
    throw new Error("Only standard website ports are supported.");
  }

  const hostname = candidate.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Private network addresses cannot be analyzed.");
  }

  const addresses = await resolver(hostname);
  if (
    !addresses.length ||
    addresses.some(({ address }) => isBlockedAddress(address))
  ) {
    throw new Error("This host resolves to a private or reserved network.");
  }
}

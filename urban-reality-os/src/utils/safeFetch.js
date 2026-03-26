export async function safeFetch(fn, fallback) {
  try {
    const res = await fn();
    return res ?? fallback;
  } catch {
    return fallback;
  }
}

export default safeFetch;

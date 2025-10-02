// utils/fetchBorrowDesk.ts

export async function fetchBorrowDesk(ticker: string) {
  try {
    const url = `https://www.iborrowdesk.com/api/ticker/${ticker}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "pump-scorecard (garthwoods@gmail.com)" },
    });

    if (!res.ok) throw new Error(`iBorrowDesk API failed: ${res.status}`);

    const json = await res.json();

    return {
      fee: json.latest_fee ? Number(json.latest_fee).toFixed(2) : "N/A",
      available: json.latest_available?.toLocaleString?.() ?? "N/A",
      updated: json.updated ?? "N/A",
      source: `https://www.iborrowdesk.com/report/${ticker}`,
      daily: json.daily ?? [],
      realTime: json.real_time ?? [],
    };
  } catch (err) {
    console.error("BorrowDesk fetch failed:", err);
    return {
      fee: "Manual Check",
      available: "Manual Check",
      updated: "N/A",
      source: `https://www.iborrowdesk.com/report/${ticker}`,
      daily: [],
      realTime: [],
    };
  }
}

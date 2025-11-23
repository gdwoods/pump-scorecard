import axios from "axios";

export interface SentimentData {
    bullish: number;
    bearish: number;
    totalMessages: number;
    score: number; // 0-100 (50 is neutral)
    lastMessageTime: string;
    messages: any[];
}

export async function fetchSentiment(ticker: string): Promise<SentimentData | null> {
    // Create a timeout promise that resolves to null after 2 seconds
    const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
            console.log(`[Sentiment] Timeout reached for ${ticker}`);
            resolve(null);
        }, 2000);
    });

    // Create the actual fetch promise
    const fetchPromise = (async (): Promise<SentimentData | null> => {
        try {
            console.log(`[Sentiment] Fetching data for ${ticker}...`);
            const startTime = Date.now();
            const url = `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`;
            const response = await axios.get(url, { timeout: 2000 });
            console.log(`[Sentiment] Received response for ${ticker} in ${Date.now() - startTime}ms`);

            const messages = response.data.messages || [];

            if (messages.length === 0) {
                console.log(`[Sentiment] No messages found for ${ticker}`);
                return null;
            }

            let bullishCount = 0;
            let bearishCount = 0;
            let totalWithSentiment = 0;

            messages.forEach((msg: any) => {
                const sentiment = msg.entities?.sentiment?.basic;
                if (sentiment === "Bullish") {
                    bullishCount++;
                    totalWithSentiment++;
                } else if (sentiment === "Bearish") {
                    bearishCount++;
                    totalWithSentiment++;
                }
            });

            // Calculate score (default to 50 if no sentiment data)
            let sentimentScore = 50;
            if (totalWithSentiment > 0) {
                const bullishRatio = bullishCount / totalWithSentiment;
                sentimentScore = Math.round(bullishRatio * 100);
            }

            console.log(`[Sentiment] Processed ${messages.length} messages for ${ticker} (${bullishCount} bullish, ${bearishCount} bearish)`);

            return {
                bullish: bullishCount,
                bearish: bearishCount,
                totalMessages: messages.length,
                score: sentimentScore,
                lastMessageTime: messages[0]?.created_at || "",
                messages,
            };
        } catch (error) {
            console.error(`[Sentiment] Error fetching sentiment for ${ticker}:`, error);
            return null;
        }
    })();

    // Race between the fetch and the timeout
    return Promise.race([fetchPromise, timeoutPromise]);
}

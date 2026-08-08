// functions/[[path]].js
// ============================================================
// টোকেন-মুক্ত ক্রস-প্রক্সি (পাবলিক অ্যাক্সেস, আইপি লুকানো)
// ============================================================

// কোন ডোমেইনের জন্য কোন হেডার পাঠাতে হবে
const HEADER_RULES = {
    "103.165.93.31": {
        "Origin": "http://103.165.93.31:8095",
        "Referer": "http://103.165.93.31:8095/",
        "User-Agent": "VLC/3.0.20"
    }
    // নতুন ডোমেইন যোগ করুন: "ডোমেইন.কম": { "Origin": "...", "Referer": "..." }
};

// ============================================================
// মূল প্রোক্সি ফাংশন (টোকেন ছাড়া)
// ============================================================

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- ১. হোমপেজ (index.html) স্বাভাবিক দেখাবে ----
    if (path === "/" || path === "/index.html") {
        return next();
    }

    // ---- ২. প্লেলিস্ট ফাইল (live.m3u) প্রোক্সি করা ----
    if (path === "/live.m3u") {
        try {
            // গিটহাবের live.m3u ফাইল পড়ুন
            const assetResponse = await context.env.ASSETS.fetch(request);
            const originalText = await assetResponse.text();

            // সব লিংককে প্রোক্সি লিংকে রূপান্তর করুন (টোকেন ছাড়া)
            const lines = originalText.split('\n');
            const rewrittenLines = lines.map(line => {
                if (line.startsWith('http://') || line.startsWith('https://')) {
                    const encoded = encodeURIComponent(line);
                    return `https://${url.host}/proxy?url=${encoded}`;
                }
                return line;
            });

            return new Response(rewrittenLines.join('\n'), {
                headers: {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Cache-Control': 'public, max-age=300',
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } catch (error) {
            return new Response(`Playlist Error: ${error.message}`, { status: 500 });
        }
    }

    // ---- ৩. M3U8 প্লেলিস্ট ও .ts ভিডিও চাঙ্ক প্রোক্সি ----
    if (path === "/proxy") {
        try {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) {
                return new Response("Missing 'url' parameter", { status: 400 });
            }

            const realUrl = decodeURIComponent(targetUrl);
            const urlObj = new URL(realUrl);
            const hostname = urlObj.hostname;

            // হেডার সেট করা
            const headers = { "User-Agent": "VLC/3.0.20" };
            if (HEADER_RULES[hostname]) {
                Object.assign(headers, HEADER_RULES[hostname]);
            }

            // আসল সার্ভার থেকে ডেটা নেওয়া
            const response = await fetch(realUrl, { headers });

            if (!response.ok) {
                return new Response(`Upstream Error: ${response.status}`, { status: response.status });
            }

            // কন্টেন্ট টাইপ চেক
            const contentType = response.headers.get("Content-Type") || "";
            if (contentType.includes("mpegurl") || contentType.includes("m3u8")) {
                const text = await response.text();
                const baseUrl = realUrl.substring(0, realUrl.lastIndexOf('/') + 1);

                // ভিডিও চাঙ্কগুলোর লিংক প্রোক্সি লিংকে রূপান্তর (টোকেন ছাড়া)
                const rewritten = text.split('\n').map(line => {
                    if (!line.startsWith('#') && line.trim().length > 0) {
                        let fullUrl = line.trim();
                        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                            fullUrl = baseUrl + fullUrl;
                        }
                        if (fullUrl.includes('.ts') || fullUrl.includes('.m3u8')) {
                            const encoded = encodeURIComponent(fullUrl);
                            return `https://${url.host}/proxy?url=${encoded}`;
                        }
                        return line;
                    }
                    return line;
                });

                return new Response(rewritten.join('\n'), {
                    headers: {
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Cache-Control': 'public, max-age=300',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            // .ts ফাইল বা বাইনারি ডেটা সরাসরি পাঠান
            const responseHeaders = new Headers(response.headers);
            responseHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(response.body, {
                status: response.status,
                headers: responseHeaders
            });

        } catch (error) {
            return new Response(`Proxy Error: ${error.message}`, { status: 500 });
        }
    }

    // ---- ৪. বাকি সব (CSS, JS, ইমেজ) স্বাভাবিক ----
    return next();
}

// functions/[[path]].js

// ============================================================
// কনফিগারেশন - এখানে আপনার তথ্য দিন
// ============================================================

const SECRET_TOKEN = "mySecretPassword123";  // আপনার সিক্রেট টোকেন

// কোন ডোমেইনের জন্য কোন হেডার পাঠাতে হবে (প্রয়োজন অনুযায়ী যোগ করুন)
const HEADER_RULES = {
    "103.165.93.31": {
        "Origin": "http://103.165.93.31:8095",
        "Referer": "http://103.165.93.31:8095/",
        "User-Agent": "VLC/3.0.20"
    }
    // নতুন ডোমেইন যোগ করতে: "ডোমেইন.কম": { "Origin": "...", "Referer": "..." }
};

// ============================================================
// মূল প্রোক্সি ফাংশন
// ============================================================

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- ১. টোকেন ভেরিফিকেশন ----
    const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
    const isAuthorized = (token === SECRET_TOKEN);

    // Homepage টোকেন ছাড়া দেখাবে
    if (path === "/" || path === "/index.html") {
        return next();
    }

    // টোকেন না থাকলে 401 এরর
    if (!isAuthorized) {
        return new Response("Unauthorized: Valid token required", { 
            status: 401,
            headers: { "Content-Type": "text/plain" }
        });
    }

    // ---- ২. প্লেলিস্ট ফাইল (live.m3u) প্রোক্সি করা ----
    if (path === "/live.m3u") {
        try {
            // আপনার গিটহাবের live.m3u ফাইল পড়ুন
            const assetResponse = await context.env.ASSETS.fetch(request);
            const originalText = await assetResponse.text();

            // ----- M3U8 প্লেলিস্ট রিরাইট করা -----
            const lines = originalText.split('\n');
            const rewrittenLines = lines.map(line => {
                // শুধু http/https লিংকগুলো পরিবর্তন করুন
                if (line.startsWith('http://') || line.startsWith('https://')) {
                    // আসল URL এনকোড করে প্রোক্সি লিংক বানান
                    const encoded = encodeURIComponent(line);
                    return `https://${url.host}/proxy?token=${SECRET_TOKEN}&url=${encoded}`;
                }
                return line;
            });

            // ইউজারকে রিরাইট করা প্লেলিস্ট পাঠান
            return new Response(rewrittenLines.join('\n'), {
                headers: {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Cache-Control': 'public, max-age=300',  // ৫ মিনিট ক্যাশ
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } catch (error) {
            return new Response(`Playlist Error: ${error.message}`, { 
                status: 500,
                headers: { "Content-Type": "text/plain" }
            });
        }
    }

    // ---- ৩. M3U8 প্লেলিস্ট ফাইল প্রোক্সি (প্রত্যেক চ্যানেলের জন্য) ----
    // ইউজার যখন /proxy?url=... দিয়ে রিকোয়েস্ট করবে
    if (path === "/proxy") {
        try {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) {
                return new Response("Missing 'url' parameter", { status: 400 });
            }

            const realUrl = decodeURIComponent(targetUrl);

            // ----- ডোমেইন অনুযায়ী হেডার নির্বাচন -----
            const urlObj = new URL(realUrl);
            const hostname = urlObj.hostname;
            const headers = {
                "User-Agent": "VLC/3.0.20"
            };

            // যদি এই ডোমেইনের জন্য রুল থাকে, তাহলে সেটা যোগ করুন
            if (HEADER_RULES[hostname]) {
                Object.assign(headers, HEADER_RULES[hostname]);
            }

            // ----- আসল সার্ভার থেকে M3U8 ফাইল ডাউনলোড -----
            const response = await fetch(realUrl, { headers });

            if (!response.ok) {
                return new Response(`Upstream Error: ${response.status}`, { 
                    status: response.status,
                    headers: { "Content-Type": "text/plain" }
                });
            }

            // ----- M3U8 ফাইল রিরাইট করা (ভিডিও চাঙ্কগুলোর URL পরিবর্তন) -----
            const contentType = response.headers.get("Content-Type") || "";
            if (contentType.includes("mpegurl") || contentType.includes("m3u8")) {
                const text = await response.text();
                const baseUrl = realUrl.substring(0, realUrl.lastIndexOf('/') + 1);
                
                const rewritten = text.split('\n').map(line => {
                    // যদি লাইনটি ইউআরএল হয় এবং কমেন্ট না হয়
                    if (!line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://') || line.match(/^[^#\s]+\.ts/))) {
                        let fullUrl = line.trim();
                        // যদি রিলেটিভ পাথ হয়, তাহলে বেস ইউআরএল যোগ করুন
                        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                            fullUrl = baseUrl + fullUrl;
                        }
                        // ভিডিও চাঙ্কগুলোর URL এনকোড করে প্রোক্সি লিংক বানান
                        const encoded = encodeURIComponent(fullUrl);
                        return `https://${url.host}/proxy?token=${SECRET_TOKEN}&url=${encoded}`;
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

            // যদি M3U8 না হয় (ভিডিও চাঙ্ক বা অন্য কিছু), তাহলে সরাসরি পাঠান
            const responseHeaders = new Headers(response.headers);
            responseHeaders.set("Access-Control-Allow-Origin", "*");
            
            return new Response(response.body, {
                status: response.status,
                headers: responseHeaders
            });

        } catch (error) {
            return new Response(`Proxy Error: ${error.message}`, { 
                status: 500,
                headers: { "Content-Type": "text/plain" }
            });
        }
    }

    // ---- ৪. বাকি সব রিকোয়েস্ট (CSS, JS, ইমেজ) স্বাভাবিকভাবে চলবে ----
    return next();
}

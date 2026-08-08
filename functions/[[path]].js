// functions/[[path]].js

const SECRET_TOKEN = "mySecretPassword123"; // আপনার টোকেন

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- টোকেন চেক ----
    const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
    if (token !== SECRET_TOKEN) {
        // শুধু homepage টোকেন ছাড়া দেখাবে
        if (path === "/" || path === "/index.html") return next();
        return new Response("Unauthorized", { status: 401 });
    }

    // ---- ১. প্লেলিস্ট ফাইল (live.m3u) হ্যান্ডেল করা ----
    if (path === "/live.m3u") {
        try {
            // আপনার গিটহাবের live.m3u ফাইল পড়ুন
            const assetRes = await context.env.ASSETS.fetch(request);
            const text = await assetRes.text();

            // প্রতিটি লিংককে প্রোক্সি লিংকে রূপান্তর
            const lines = text.split('\n').map(line => {
                if (line.startsWith('http://') || line.startsWith('https://')) {
                    const encoded = encodeURIComponent(line);
                    return `https://${url.host}/proxy?token=${SECRET_TOKEN}&url=${encoded}`;
                }
                return line;
            });

            return new Response(lines.join('\n'), {
                headers: {
                    'Content-Type': 'audio/x-mpegurl',
                    'Cache-Control': 'no-cache'
                }
            });
        } catch (err) {
            return new Response(`Playlist Error: ${err.message}`, { status: 500 });
        }
    }

    // ---- ২. .ts ভিডিও ফাইল প্রোক্সি করা (সবচেয়ে গুরুত্বপূর্ণ) ----
    if (path === "/proxy") {
        try {
            const target = url.searchParams.get("url");
            if (!target) return new Response("Missing url", { status: 400 });

            // আসল URL ডিকোড করুন
            const realUrl = decodeURIComponent(target);

            // আসল সার্ভারে রিকোয়েস্ট পাঠান (সঠিক হেডারসহ)
            const response = await fetch(realUrl, {
                headers: {
                    "User-Agent": request.headers.get("User-Agent") || "VLC/3.0.0",
                    "Referer": "http://103.165.93.31:8095", // অনেক সার্ভার রেফারার চেক করে
                    "Origin": "http://103.165.93.31:8095"
                }
            });

            // যদি সার্ভার থেকে ২০০ বা ৩০৪ না আসে, তাহলে এরর দেখান
            if (!response.ok) {
                return new Response(`Upstream Error: ${response.status}`, { status: response.status });
            }

            // ভিডিও ডেটা স্ট্রিমিং আকারে পাঠান
            return new Response(response.body, {
                status: response.status,
                headers: {
                    "Content-Type": response.headers.get("Content-Type") || "video/mp2t",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600"
                }
            });
        } catch (err) {
            return new Response(`Proxy Error: ${err.message}`, { status: 500 });
        }
    }

    // ---- ৩. বাকি সব (CSS, ইমেজ, ইত্যাদি) ----
    return next();
}

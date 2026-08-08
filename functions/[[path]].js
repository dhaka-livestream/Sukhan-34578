// functions/[[path]].js

const SECRET_TOKEN = "mySecretPassword123"; // আপনার টোকেন (যদি পরিবর্তন করে থাকেন, এখানে সেট দিন)

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- টোকেন ভেরিফিকেশন ----
    const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
    const isAuthorized = (token === SECRET_TOKEN);

    // ওয়েবসাইটের হোমপেজ (index.html) টোকেন ছাড়া দেখান
    if (path === "/" || path === "/index.html") {
        return next();
    }

    // যদি টোকেন না মিলে, 401 এরর দিন
    if (!isAuthorized) {
        return new Response("Unauthorized: Valid token required", { status: 401 });
    }

    // ---- ১. মূল প্লেলিস্ট ফাইল (live.m3u) হ্যান্ডেল করা ----
    if (path === "/live.m3u") {
        try {
            // আপনার গিটহাবের live.m3u ফাইলটি পড়ুন
            const assetResponse = await context.env.ASSETS.fetch(request);
            const originalText = await assetResponse.text();

            // ফাইলের প্রতিটি লাইন চেক করে লিংকগুলোকে প্রোক্সি লিংকে রূপান্তর করুন
            const lines = originalText.split('\n');
            const modifiedLines = lines.map(line => {
                // যদি লাইনটি কোনো http/https লিংক হয়
                if (line.startsWith('http://') || line.startsWith('https://')) {
                    // লিংকটি এনকোড করে প্রোক্সি পাথে নিয়ে যান
                    const encoded = encodeURIComponent(line);
                    // এখানে https://sukhan-34578.pages.dev স্বয়ংক্রিয়ভাবে বসে যাবে
                    return `https://${url.host}/proxy?token=${SECRET_TOKEN}&url=${encoded}`;
                }
                return line; // অন্য লাইন (যেমন #EXTINF) অপরিবর্তিত রাখুন
            });

            // ইউজারকে পরিবর্তিত প্লেলিস্ট পাঠান
            return new Response(modifiedLines.join('\n'), {
                headers: {
                    'Content-Type': 'audio/x-mpegurl',
                    'Cache-Control': 'no-cache, must-revalidate'
                }
            });
        } catch (error) {
            // কোনো এরর হলে সেটা ব্রাউজারে দেখান (ডিবাগিংয়ের জন্য)
            return new Response(`Error reading playlist: ${error.message}`, { status: 500 });
        }
    }

    // ---- ২. ভিডিওর ছোট অংশ (.ts ফাইল) প্রোক্সি করা ----
    if (path === "/proxy") {
        try {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) {
                return new Response("Missing 'url' parameter", { status: 400 });
            }

            // আসল সার্ভার থেকে .ts ফাইলটি ডাউনলোড করুন
            const proxyResponse = await fetch(decodeURIComponent(targetUrl), {
                headers: { "User-Agent": request.headers.get("User-Agent") || "VLC/3.0.0" }
            });

            // ভিডিও ডেটা ক্লায়েন্টে ফরওয়ার্ড করুন
            return new Response(proxyResponse.body, {
                status: proxyResponse.status,
                headers: {
                    "Content-Type": proxyResponse.headers.get("Content-Type") || "video/mp2t",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        } catch (error) {
            return new Response(`Proxy Error: ${error.message}`, { status: 500 });
        }
    }

    // ---- ৩. বাকি সব (CSS, JS, ইমেজ) স্বাভাবিকভাবে চলবে ----
    return next();
}

// functions/[[path]].js

// ইউজারকে যে টোকেন দেবেন (আপনার দেওয়া উদাহরণ: 53805723)
const SECRET_TOKEN = "53805723";

// চ্যানেলগুলোর রিয়েল লিংক এবং ফেক পাথের ম্যাপিং
const CHANNEL_MAP = {
    "/zeebangla/live.m3u8": "http://103.165.93.31:8095/zeeBangla/tracks-v1a1/mono.m3u8"
    // আপনি চাইলে এখানে আরও চ্যানেল যোগ করতে পারেন, যেমন:
    // "/sony/live.m3u8": "http://103.165.93.31:8095/sony/...",
};

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // ১. টোকেন ভেরিফিকেশন (শুধু ম্যানিফেস্ট ও প্রোক্সির জন্য)
    const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
    
    // যদি টোকেন মিলেনা বা ভুল হয়
    if (token !== SECRET_TOKEN) {
        // শুধু ওয়েবসাইটের index.html যেন খোলা যায় (সেটা টোকেন ছাড়া দেখাবে)
        if (path === "/" || path === "/index.html") {
            return next();
        }
        return new Response("Unauthorized: Valid token required", { status: 401 });
    }

    // ২. চ্যানেলের ম্যানিফেস্ট ফাইল (live.m3u8) হ্যান্ডেল করা
    if (CHANNEL_MAP[path]) {
        const realUrl = CHANNEL_MAP[path];
        
        // আসল সার্ভার থেকে ম্যানিফেস্ট ডাউনলোড করুন
        const manifestResponse = await fetch(realUrl, {
            headers: { "User-Agent": request.headers.get("User-Agent") || "VLC/3.0.0" }
        });

        let manifestText = await manifestResponse.text();
        
        // ম্যানিফেস্টের ভেতরের .ts ফাইলের লিংকগুলো বের করে প্রোক্সি লিংকে রূপান্তর করুন
        const baseUrl = realUrl.substring(0, realUrl.lastIndexOf('/') + 1);
        const proxyBase = url.origin; // এটি স্বয়ংক্রিয়ভাবে https://sukhan.pages.dev ধরে নেবে

        const lines = manifestText.split('\n');
        const newLines = lines.map(line => {
            // যদি লাইনে .ts থাকে এবং সেটা কমেন্ট লাইন (#) না হয়
            if (line.includes('.ts') && !line.startsWith('#')) {
                let fullUrl = line.trim();
                // যদি লিংকটি রিলেটিভ হয় (যেমন: segment_001.ts), তাহলে বেস যোগ করুন
                if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                    fullUrl = baseUrl + fullUrl;
                }
                // আসল ইউআরএল এনকোড করে প্রোক্সি লিংক বানান (টোকেনও যোগ করা আছে)
                const encoded = encodeURIComponent(fullUrl);
                return `${proxyBase}/proxy?token=${SECRET_TOKEN}&url=${encoded}`;
            }
            return line;
        });
        const rewrittenText = newLines.join('\n');

        // ইউজারকে পরিবর্তিত ম্যানিফেস্ট পাঠান
        return new Response(rewrittenText, {
            headers: {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, must-revalidate'
            }
        });
    }

    // ৩. ভিডিওর ছোট ছোট অংশ (**.ts ফাইল**) প্রোক্সি করা
    if (path === "/proxy") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
            return new Response("Missing 'url' parameter", { status: 400 });
        }

        // আসল সার্ভার থেকে .ts ফাইলটি স্ট্রিমিং আকারে নিন
        const proxyResponse = await fetch(decodeURIComponent(targetUrl), {
            headers: { "User-Agent": request.headers.get("User-Agent") || "VLC/3.0.0" }
        });

        // হেডার কপি করুন (যাতে ভিডিও সঠিকভাবে চলে)
        const headers = new Headers(proxyResponse.headers);
        headers.set("Access-Control-Allow-Origin", "*");

        // স্ট্রিম আকারে ইউজারকে পাঠান (এতে টাইমআউট হবে না)
        return new Response(proxyResponse.body, {
            status: proxyResponse.status,
            headers: headers
        });
    }

    // ৪. বাকি সব রিকোয়েস্ট (যেমন /index.html, /style.css) স্বাভাবিক চলবে
    return next();
}

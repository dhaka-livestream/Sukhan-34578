// functions/[[path]].js

const SECRET_KEY = "mySecretPassword123"; // আপনার টোকেন

// ফাইলের ভেতরের আসল লিংকগুলোর বেস URL (যা লুকাতে চান)
const ORIGIN_BASE = "http://103.165.93.31:8095";

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // ১. যদি কেউ /proxy পাথে রিকোয়েস্ট করে (ভিডিও স্ট্রিম চাচ্ছে)
    if (path.startsWith("/proxy")) {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
            return new Response("Missing 'url' parameter", { status: 400 });
        }

        // ইউজারের টোকেন চেক করুন (ঐচ্ছিক, কিন্তু ভালো)
        const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
        if (token !== SECRET_KEY) {
            return new Response("Unauthorized", { status: 401 });
        }

        // আসল সার্ভার থেকে ডেটা ফেচ করুন
        const response = await fetch(targetUrl);
        const headers = new Headers(response.headers);
        
        // ক্লায়েন্টে ফরওয়ার্ড করুন
        return new Response(response.body, {
            status: response.status,
            headers: headers
        });
    }

    // ২. যদি কেউ /live.m3u চায় (প্লেলিস্ট ফাইল)
    if (path === "/live.m3u") {
        const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
        if (token !== SECRET_KEY) {
            return new Response("Unauthorized: সঠিক টোকেন দিন", { status: 401 });
        }

        // আসল live.m3u ফাইলটি পড়ুন
        const assetResponse = await context.env.ASSETS.fetch(request);
        const originalText = await assetResponse.text();

        // প্রতিটি লিংককে প্রোক্সি লিংকে রূপান্তর করুন
        const modifiedText = originalText.split('\n').map(line => {
            // যদি লাইনটি কোনো লিংক হয় (http বা https দিয়ে শুরু)
            if (line.startsWith('http://') || line.startsWith('https://')) {
                // আসল লিংকটি এনকোড করে প্রোক্সি লিংক তৈরি করুন
                const encodedUrl = encodeURIComponent(line);
                // নিজের প্রোক্সি পাথ তৈরি করুন (টোকেনও যোগ করুন)
                return `https://sukhan-34578.pages.dev/proxy?url=${encodedUrl}&token=${SECRET_KEY}`;
            }
            return line;
        }).join('\n');

        return new Response(modifiedText, {
            headers: {
                'Content-Type': 'audio/x-mpegurl',
                'Cache-Control': 'no-cache, must-revalidate'
            }
        });
    }

    // ৩. বাকি সব (index.html, ইমেজ ইত্যাদি) স্বাভাবিকভাবে চলতে দিন
    return next();
}

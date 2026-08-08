// functions/[[path]].js

// আপনার সিক্রেট পাসওয়ার্ড/টোকেন সেট করুন (যেকোনো কিছু দিন)
const SECRET_KEY = "mySecretPassword123";

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // ১. যদি কেউ live.m3u চায়
    if (path === "/live.m3u") {
        // চেক করুন ইউজার সঠিক টোকেন দিচ্ছে কিনা (Query Parameter বা Header দিয়ে)
        const token = url.searchParams.get("token") || request.headers.get("x-auth-token");

        if (token !== SECRET_KEY) {
            return new Response("Unauthorized: সঠিক টোকেন দিন", { status: 401 });
        }

        // স্ট্যাটিক ফাইল সার্ভার থেকে আসল live.m3u ফাইলটি পড়ুন
        const assetResponse = await context.env.ASSETS.fetch(request);
        const originalText = await assetResponse.text();

        // (অপশনাল) লিংকগুলোর সাথে টাইমস্ট্যাম্প বা ডাইনামিক কিছু যোগ করতে পারেন
        // যেমন: এখানে প্রতি লাইনের শেষে একটি ডামি প্যারামিটার যোগ করলাম
        const modifiedText = originalText.split('\n').map(line => {
            if (line.startsWith('http://') || line.startsWith('https://')) {
                // লিংকের সাথে একটি র‍্যান্ডম বা টাইম-ভিত্তিক টোকেন যোগ করুন
                return line + '?auth=' + Date.now();
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

    // ২. অন্য যেকোনো রিকোয়েস্ট (যেমন index.html, CSS, ইমেজ) স্বাভাবিকভাবে চলতে দিন
    return next();
}

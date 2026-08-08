// functions/[[path]].js
// ============================================================
// টোকেন-মুক্ত লাইটওয়েট প্রোক্সি (শুধু M3U রিরাইট, .ts ডাইরেক্ট)
// ============================================================

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // Homepage দেখাবে
    if (path === "/" || path === "/index.html") {
        return next();
    }

    // ---- প্লেলিস্ট ফাইল (live.m3u) রিরাইট করা ----
    if (path === "/live.m3u") {
        try {
            // গিটহাবের live.m3u ফাইল পড়ুন
            const assetResponse = await context.env.ASSETS.fetch(request);
            const text = await assetResponse.text();

            // আসল লিংক অপরিবর্তিত রাখুন (শুধু ফাইলটি পরিবেশন করুন)
            // এতে কোনো প্রোক্সি নেই, তাই বাফারিং হবে না
            return new Response(text, {
                headers: {
                    'Content-Type': 'audio/x-mpegurl',
                    'Cache-Control': 'no-cache, must-revalidate',
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    }

    // বাকি সব (CSS, ইমেজ) স্বাভাবিক
    return next();
}

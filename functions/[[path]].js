// functions/[[path]].js
const SECRET_KEY = "mySecretPassword123"; // আপনার টোকেন

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // শুধুমাত্র live.m3u ফাইলটি অ্যাক্সেসের জন্য টোকেন চেক করুন
    if (path === "/live.m3u") {
        const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
        if (token !== SECRET_KEY) {
            return new Response("Unauthorized: সঠিক টোকেন দিন", { status: 401 });
        }

        // আসল live.m3u ফাইলটি সরাসরি ক্লায়েন্টকে দিন (কোনো পরিবর্তন ছাড়া)
        // এতে চ্যানেল পুরোপুরি ঠিকমত চলবে
        return context.env.ASSETS.fetch(request);
    }

    // বাকি সব (index.html) স্বাভাবিক চলবে
    return next();
}

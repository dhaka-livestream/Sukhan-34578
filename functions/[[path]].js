// functions/[[path]].js

const SECRET_KEY = "mySecretPassword123";

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // টোকেন চেক
    if (path === "/live.m3u") {
        const token = url.searchParams.get("token") || request.headers.get("x-auth-token");
        if (token !== SECRET_KEY) {
            return new Response("Unauthorized: Valid token required", { status: 401 });
        }

        // live.m3u ফাইলটি সরাসরি ক্লায়েন্টকে দিন (প্রোক্সি ছাড়া)
        return context.env.ASSETS.fetch(request);
    }

    // বাকি সব (index.html, CSS) খোলা থাকবে
    return next();
}

const WebSocket = require("ws");
const axios = require("axios");

(async () => {
  const base = "https://xocdia.apiquadautayshelby.vip/signalr";
  const hub = "sedieHub";
  const nego = await axios.get(`${base}/negotiate`, {
    params: {
      clientProtocol: 1.5,
      connectionData: JSON.stringify([{ name: hub }]),
    },
  });

  const ws = new WebSocket(
    `${base}/connect?transport=webSockets` +
      `&clientProtocol=1.5` +
      `&connectionToken=${encodeURIComponent(nego.data.ConnectionToken)}` +
      `&connectionData=${encodeURIComponent(JSON.stringify([{ name: hub }]))}`
  );

  ws.on("open", () => {
    console.log("connected");
    ws.send(JSON.stringify({ H: hub, M: "Subscribe", A: [], I: 0 }));
  });

  let count = 0;
  ws.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf);
      if (!msg.M) return;
      for (const item of msg.M) {
        const payload = item.A?.[0];
        if (!payload) continue;
        const v = payload.Result;
        if (typeof v === "number") {
          count += 1;
          console.log("event:", item.M, "value:", v, "payload:", JSON.stringify(payload));
          if (count >= 8) {
            ws.close();
            process.exit(0);
          }
        }
      }
    } catch {}
  });
})();

(function () {
  var script = document.currentScript;
  var siteId = script && script.getAttribute("data-pulsewatch-site");
  if (siteId !== "portfolio" && siteId !== "highforce") return;

  var endpoint = "https://d1kd92no8bklbu.cloudfront.net/api/analytics/visit";
  var send = function () {
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId: siteId }),
      keepalive: true,
      credentials: "omit"
    }).catch(function () {});
  };

  send();
  window.addEventListener("popstate", send);
  var originalPushState = window.history.pushState;
  window.history.pushState = function () {
    originalPushState.apply(this, arguments);
    send();
  };
})();

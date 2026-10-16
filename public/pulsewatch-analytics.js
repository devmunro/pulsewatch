(function () {
  var script = document.currentScript;
  var siteId = script && script.getAttribute("data-pulsewatch-site");
  if (siteId !== "portfolio" && siteId !== "highforce") return;

  var optOutKey = "pulsewatch-analytics-opt-out";
  var endpoint = "https://d1kd92no8bklbu.cloudfront.net/api/analytics/visit";
  var isOptedOut = function () {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1") return true;
    try {
      return window.localStorage.getItem(optOutKey) === "true";
    } catch (_) {
      // If this browser cannot remember the privacy choice, do not send analytics.
      return true;
    }
  };
  var send = function () {
    if (isOptedOut()) return;
    fetch(endpoint, {
      method: "POST",
      // Analytics does not need a readable response; a simple request avoids
      // browser preflight failures on otherwise approved site aliases.
      mode: "no-cors",
      body: JSON.stringify({ siteId: siteId }),
      keepalive: true,
      credentials: "omit"
    }).catch(function () {});
  };

  window.PulseWatchAnalytics = {
    disable: function () {
      try { window.localStorage.setItem(optOutKey, "true"); } catch (_) {}
    },
    enable: function () {
      try { window.localStorage.removeItem(optOutKey); } catch (_) { return; }
      send();
    }
  };

  send();
  window.addEventListener("popstate", send);
  var originalPushState = window.history.pushState;
  window.history.pushState = function () {
    originalPushState.apply(this, arguments);
    send();
  };
})();

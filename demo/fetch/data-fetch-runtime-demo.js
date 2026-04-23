const eventLog = document.querySelector('#eventLog');
const runtimeStatus = document.querySelector('#runtimeStatus');
const runtimeBadge = document.querySelector('#runtimeBadge');

function resolveHaoriApi() {
  return (window.Haori && (window.Haori.Haori || window.Haori.default || window.Haori)) || null;
}

function appendLog(message) {
  if (!eventLog) {
    return;
  }

  const current = eventLog.textContent || '';
  eventLog.textContent = `${current}${current ? '\n' : ''}${message}`;
}

function formatQueryString(queryString) {
  return queryString && queryString.length > 0 ? queryString : '(none)';
}

document.addEventListener('DOMContentLoaded', () => {
  const haoriApi = resolveHaoriApi();
  if (haoriApi && typeof haoriApi.setRuntime === 'function') {
    haoriApi.setRuntime('demo');
  }

  const runtime = haoriApi && typeof haoriApi.runtime === 'string'
    ? haoriApi.runtime
    : 'unknown';

  if (runtimeStatus) {
    runtimeStatus.textContent = `実行モード: ${runtime}`;
  }

  if (runtimeBadge) {
    runtimeBadge.textContent = runtime;
  }

  appendLog(`runtime=${runtime}`);
});

document.addEventListener('haori:fetchstart', (event) => {
  const detail = event.detail || {};
  appendLog(
    `start: requested=${detail.requestedMethod || '(unknown)'} effective=${detail.effectiveMethod || '(unknown)'} transport=${detail.transportMode || '(unknown)'} query=${formatQueryString(detail.queryString)}`,
  );
});

document.addEventListener('haori:fetchend', (event) => {
  const detail = event.detail || {};
  appendLog(`end: status=${detail.status} duration=${detail.durationMs}ms`);
});

document.addEventListener('haori:fetcherror', (event) => {
  const detail = event.detail || {};
  appendLog(`error: status=${detail.status || '(none)'} message=${detail.error}`);
});
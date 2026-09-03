/**
 * Enamel AI Operations Dashboard Client Application
 */

(function () {
  'use strict';

  // State
  let currentTab = 'overview';
  let gapsLimit = 10;
  let gapsOffset = 0;
  let autoRefreshInterval = null;
  let isLoadingStats = false;
  let isLoadingGaps = false;

  // DOM Elements
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');
  const gatewayStatusBadge = document.getElementById('gatewayStatusBadge');
  const gwConnText = document.getElementById('gwConnText');
  const gwLatencyText = document.getElementById('gwLatencyText');
  const gwHeartbeatText = document.getElementById('gwHeartbeatText');
  const refreshBtn = document.getElementById('refreshBtn');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');

  // Notice Banner
  const globalNotice = document.getElementById('globalNotice');
  const noticeTitle = document.getElementById('noticeTitle');
  const noticeDesc = document.getElementById('noticeDesc');
  const noticeCloseBtn = document.getElementById('noticeCloseBtn');

  // Overview Values
  const valTotalConversations = document.getElementById(
    'valTotalConversations',
  );
  const valAiConversations = document.getElementById('valAiConversations');
  const valHumanConversations = document.getElementById(
    'valHumanConversations',
  );
  const valTotalAiRuns = document.getElementById('valTotalAiRuns');
  const valSuccessfulAiRuns = document.getElementById('valSuccessfulAiRuns');
  const valFailedAiRuns = document.getElementById('valFailedAiRuns');
  const valHumanHandoffs = document.getElementById('valHumanHandoffs');
  const valKnowledgeGaps = document.getElementById('valKnowledgeGaps');
  const valAverageAiLatency = document.getElementById('valAverageAiLatency');

  // Knowledge Gaps Elements
  const knowledgeGapsTableBody = document.getElementById(
    'knowledgeGapsTableBody',
  );
  const gapsEmptyState = document.getElementById('gapsEmptyState');
  const gapsErrorState = document.getElementById('gapsErrorState');
  const retryGapsBtn = document.getElementById('retryGapsBtn');
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const pageOffsetStart = document.getElementById('pageOffsetStart');
  const pageOffsetEnd = document.getElementById('pageOffsetEnd');
  const currentPageIndicator = document.getElementById('currentPageIndicator');

  // Helper: Escape HTML to avoid XSS
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDateTime(isoString) {
    if (!isoString) return '--';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return String(isoString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return String(isoString);
    }
  }

  // Notice Management
  function showNotice(title, desc) {
    if (!globalNotice) return;
    noticeTitle.textContent = title;
    noticeDesc.textContent = desc;
    globalNotice.classList.remove('hidden');
  }

  function hideNotice() {
    if (!globalNotice) return;
    globalNotice.classList.add('hidden');
  }

  if (noticeCloseBtn) {
    noticeCloseBtn.addEventListener('click', hideNotice);
  }

  // Tab Navigation
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      if (!target || target === currentTab) return;

      currentTab = target;
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPanel = document.getElementById(`tab-${target}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }

      if (target === 'knowledge-gaps') {
        loadKnowledgeGaps();
      }
    });
  });

  // Health Check
  async function checkGatewayHealth() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const gw = data.gateway || {};
      if (gw.status === 'ok') {
        gatewayStatusBadge.className = 'status-badge status-ok';
        gatewayStatusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">Gateway 正常 (${gw.latencyMs}ms)</span>`;
        gwConnText.textContent = '运行正常 (Healthy)';
        gwConnText.style.color = 'var(--color-success)';
        gwLatencyText.textContent = `${gw.latencyMs} ms`;
        gwHeartbeatText.textContent = formatDateTime(
          gw.timestamp || data.timestamp,
        );
        hideNotice();
        return true;
      } else {
        gatewayStatusBadge.className = 'status-badge status-unreachable';
        gatewayStatusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">Gateway 离线</span>`;
        gwConnText.textContent = '无法连通 (Unreachable)';
        gwConnText.style.color = 'var(--color-danger)';
        gwLatencyText.textContent = `${gw.latencyMs || '--'} ms`;
        gwHeartbeatText.textContent = '--';
        showNotice(
          '暂时无法连接 Gateway',
          'AI Gateway 后端服务未运行或无法连通，展示数据可能为离线状态。',
        );
        return false;
      }
    } catch {
      gatewayStatusBadge.className = 'status-badge status-unreachable';
      gatewayStatusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">BFF 离线</span>`;
      gwConnText.textContent = 'BFF 异常';
      gwConnText.style.color = 'var(--color-danger)';
      gwLatencyText.textContent = '-- ms';
      gwHeartbeatText.textContent = '--';
      showNotice(
        '暂时无法获取数据',
        'Dashboard BFF 服务无响应，请确认 node 进程是否正常监听。',
      );
      return false;
    }
  }

  // Load Overview Stats
  async function loadStats() {
    if (isLoadingStats) return;
    isLoadingStats = true;

    try {
      const res = await fetch('/api/stats');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.message ||
            '无法拉取最新的运营聚合指标，请检查 Gateway 运行状态。',
        );
      }

      const data = await res.json();
      valTotalConversations.textContent =
        data.totalConversations.toLocaleString();
      valAiConversations.textContent =
        data.aiModeConversations.toLocaleString();
      valHumanConversations.textContent =
        data.humanModeConversations.toLocaleString();
      valTotalAiRuns.textContent = data.totalAiRuns.toLocaleString();
      valSuccessfulAiRuns.textContent = data.successfulAiRuns.toLocaleString();
      valFailedAiRuns.textContent = data.failedAiRuns.toLocaleString();
      valHumanHandoffs.textContent = data.humanHandoffs.toLocaleString();
      valKnowledgeGaps.textContent = data.knowledgeGaps.toLocaleString();
      valAverageAiLatency.textContent =
        data.averageAiLatencyMs !== null &&
        data.averageAiLatencyMs !== undefined
          ? data.averageAiLatencyMs
          : '--';
    } catch (err) {
      valTotalConversations.textContent = '--';
      valAiConversations.textContent = '--';
      valHumanConversations.textContent = '--';
      valTotalAiRuns.textContent = '--';
      valSuccessfulAiRuns.textContent = '--';
      valFailedAiRuns.textContent = '--';
      valHumanHandoffs.textContent = '--';
      valKnowledgeGaps.textContent = '--';
      valAverageAiLatency.textContent = '--';
      showNotice(
        '暂时无法获取数据',
        err instanceof Error
          ? err.message
          : '无法拉取最新的运营聚合指标，请检查 Gateway 运行状态。',
      );
    } finally {
      isLoadingStats = false;
    }
  }

  // Load Knowledge Gaps
  async function loadKnowledgeGaps() {
    if (isLoadingGaps) return;
    isLoadingGaps = true;

    gapsEmptyState.classList.add('hidden');
    gapsErrorState.classList.add('hidden');
    knowledgeGapsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="table-loading-row">
          <div class="skeleton-loader">正在加载知识盲区数据...</div>
        </td>
      </tr>
    `;

    try {
      const res = await fetch(
        `/api/knowledge-gaps?limit=${gapsLimit}&offset=${gapsOffset}`,
      );
      if (!res.ok) {
        throw new Error('Knowledge gaps request failed');
      }

      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      if (items.length === 0) {
        knowledgeGapsTableBody.innerHTML = '';
        if (gapsOffset === 0) {
          gapsEmptyState.classList.remove('hidden');
        }
        pageOffsetStart.textContent = gapsOffset > 0 ? String(gapsOffset) : '0';
        pageOffsetEnd.textContent = String(gapsOffset);
      } else {
        gapsEmptyState.classList.add('hidden');
        knowledgeGapsTableBody.innerHTML = items
          .map((item) => {
            let reasonTag =
              '<span class="table-tag">' + escapeHtml(item.reason) + '</span>';
            if (item.reason === 'NO_ANSWER') {
              reasonTag =
                '<span class="table-tag tag-no-answer">无知识库答案 (NO_ANSWER)</span>';
            } else if (item.reason === 'MAXKB_ERROR') {
              reasonTag =
                '<span class="table-tag tag-maxkb-error">知识库异常 (MAXKB_ERROR)</span>';
            }

            let statusTag = '';
            if (item.status === 'OPEN') {
              statusTag =
                '<span class="table-tag tag-open">待处理 (OPEN)</span>';
            } else if (item.status === 'RESOLVED') {
              statusTag =
                '<span class="table-tag tag-resolved">已解决 (RESOLVED)</span>';
            } else {
              statusTag =
                '<span class="table-tag tag-unknown">未知状态 (' +
                escapeHtml(item.status) +
                ')</span>';
            }

            return `
              <tr>
                <td><strong>#${escapeHtml(item.id)}</strong></td>
                <td><code class="table-code">${escapeHtml(item.conversationId)}</code></td>
                <td><code class="table-code">${escapeHtml(item.messageId)}</code></td>
                <td>${reasonTag}</td>
                <td>${statusTag}</td>
                <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
              </tr>
            `;
          })
          .join('');

        pageOffsetStart.textContent = String(gapsOffset + 1);
        pageOffsetEnd.textContent = String(gapsOffset + items.length);
      }

      // Pagination buttons
      const currentPage = Math.floor(gapsOffset / gapsLimit) + 1;
      currentPageIndicator.textContent = `第 ${currentPage} 页`;
      prevPageBtn.disabled = gapsOffset === 0;
      nextPageBtn.disabled = items.length < gapsLimit;
    } catch {
      knowledgeGapsTableBody.innerHTML = '';
      gapsErrorState.classList.remove('hidden');
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      pageOffsetStart.textContent = '0';
      pageOffsetEnd.textContent = '0';
    } finally {
      isLoadingGaps = false;
    }
  }

  // Pagination Event Listeners
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (gapsOffset >= gapsLimit) {
        gapsOffset -= gapsLimit;
        loadKnowledgeGaps();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      gapsOffset += gapsLimit;
      loadKnowledgeGaps();
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      gapsLimit = parseInt(e.target.value, 10) || 10;
      gapsOffset = 0;
      loadKnowledgeGaps();
    });
  }

  if (retryGapsBtn) {
    retryGapsBtn.addEventListener('click', () => {
      loadKnowledgeGaps();
    });
  }

  // Refresh All
  async function refreshAll() {
    refreshBtn.disabled = true;
    try {
      await checkGatewayHealth();
      await loadStats();
      if (currentTab === 'knowledge-gaps') {
        await loadKnowledgeGaps();
      }
    } finally {
      setTimeout(() => {
        refreshBtn.disabled = false;
      }, 300);
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAll);
  }

  // Auto Refresh
  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        autoRefreshInterval = setInterval(() => {
          refreshAll();
        }, 10000);
      } else {
        if (autoRefreshInterval) {
          clearInterval(autoRefreshInterval);
          autoRefreshInterval = null;
        }
      }
    });
  }

  // Initial Load
  refreshAll();
})();

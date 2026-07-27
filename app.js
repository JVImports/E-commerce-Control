// State management
const mavisRuntimeConfig = Object.freeze(window.MAVIS_RUNTIME_CONFIG || {});
let supabaseUrl = String(mavisRuntimeConfig.supabaseUrl || '').trim();
let supabaseKey = String(mavisRuntimeConfig.publishableKey || '').trim();
let supabaseClient = null;
let activeView = 'dashboard';
let stockPlanningData = [];
let shopeeProductsData = [];
let financialSummaryData = null;
let financialDailyData = [];
let landedCostEntriesData = [];
let skuDailyDemandData = [];
let selectedPeriod = '30';
let selectedShop = 'all'; // active shop filter
let userShops = [];       // user's connected shops list
let catalogSummaryData = null;
let adsSummaryData = null;
let productPerformanceData = [];
let walletData = null;
let localCompletedTasks = JSON.parse(localStorage.getItem('completed_tasks') || '[]');

// DOM elements
const views = {
  dashboard: document.getElementById('dashboard-view'),
  financeiro: document.getElementById('financeiro-view'),
  estoque: document.getElementById('estoque-view'),
  anuncios: document.getElementById('anuncios-view'),
  importer: document.getElementById('importer-view'),
  'shopee-sync': document.getElementById('shopee-sync-view'),
  config: document.getElementById('config-view'),
  setup: document.getElementById('setup-view')
};

// Global Sanitization Helper to prevent Cross-Site Scripting (XSS) via database text injection
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const navItems = document.querySelectorAll('.nav-item');
const viewTitle = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');

// Initialize App
window.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  ['setup-view', 'config-view'].forEach((id) => document.getElementById(id)?.remove());
  
  if (!supabaseUrl || !supabaseKey) {
    document.documentElement.dataset.mavisBootState = 'fatal-config';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('login-title').innerText = 'Serviço temporariamente indisponível';
    document.getElementById('login-subtitle').innerText = 'Não foi possível iniciar o ambiente. Tente novamente mais tarde.';
    document.getElementById('login-form-fields').style.display = 'none';
    window.dispatchEvent(new CustomEvent('mavis:fatal-config'));
  } else {
    document.documentElement.dataset.mavisBootState = 'booting';
    initSupabase();
    
    // Check URL parameters returned by Shopee authorization
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const shopId = urlParams.get('shop_id');
    
    // Check session
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (!error && session) {
        document.documentElement.dataset.mavisBootState = 'authenticated';
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Fetch user shops first
        await fetchUserShops();
        
        // Handle OAuth connection if present in URL
        if (code && shopId) {
          await handleOAuthRedirect(code, shopId);
        }
        
        await loadAllData();
        const reviewMode = new URLSearchParams(window.location.search).get('review') === 'shopee';
        switchView(reviewMode ? 'shopee-sync' : 'dashboard');
        window.dispatchEvent(new CustomEvent('mavis:auth-restored', { detail: { user: session.user } }));
      } else {
        document.documentElement.dataset.mavisBootState = 'unauthenticated';
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('login-container').style.display = 'flex';
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      document.getElementById('app-container').style.display = 'none';
      document.getElementById('login-container').style.display = 'flex';
      document.documentElement.dataset.mavisBootState = 'unauthenticated';
    }
  }
  
  // Bind Drag & Drop event listener ONCE on load to avoid duplicate event bounds (prevents memory leak)
  setupDragAndDrop();
});

// Setup & Credentials
function initSupabase() {
  if (supabaseUrl && supabaseKey) {
    const { createClient } = supabase;
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    window.supabaseClient = supabaseClient;
  }
}

async function saveCredentials() {
  const urlInput = document.getElementById('input-supabase-url').value.trim();
  const keyInput = document.getElementById('input-supabase-key').value.trim();
  
  if (!urlInput || !keyInput) {
    alert('Por favor, preencha todos os campos!');
    return;
  }

  // Visual loading feedback
  const saveBtn = document.querySelector('.btn-primary');
  const originalText = saveBtn.innerText;
  saveBtn.disabled = true;
  saveBtn.innerText = 'Testando conexão...';

  // Remove old error alert if exists
  const existingAlert = document.getElementById('conn-error-alert');
  if (existingAlert) existingAlert.remove();

  try {
    // 1. Basic URL format validation
    if (!urlInput.startsWith('https://') || !urlInput.includes('.supabase.')) {
      throw new Error('A URL do Supabase é inválida. Deve iniciar com "https://" e conter ".supabase.co" ou ".supabase.net".');
    }

    // 2. Instantiate temporary client
    const { createClient } = supabase;
    const testClient = createClient(urlInput, keyInput);

    // 3. Test connection by querying a simple record from shopee_products
    const { data, error } = await testClient
      .from('shopee_products')
      .select('item_id')
      .limit(1);

    if (error) {
      if (error.message.includes('Fetch') || error.status === 400 || error.status === 401) {
        throw new Error('Anon Key inválida, URL errada ou permissão de acesso negada. Verifique suas credenciais.');
      }
      throw error;
    }

    // Connection Success! Save credentials
    localStorage.setItem('supabase_url', urlInput);
    localStorage.setItem('supabase_key', keyInput);
    
    supabaseUrl = urlInput;
    supabaseKey = keyInput;
    
    initSupabase();
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'flex';
  } catch (error) {
    console.error("Conexão falhou:", error);
    
    // Display error alert inside the Setup container
    const errorAlert = document.createElement('div');
    errorAlert.id = 'conn-error-alert';
    errorAlert.style.cssText = 'background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); padding: 16px; border-radius: 12px; margin-top: 20px; color: #f87171; font-size: 0.85rem;';
    errorAlert.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
        <i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i> Falha na Conexão
      </div>
      <div>${error.message || 'Erro de rede ou credenciais incorretas. Certifique-se de que os dados copiados estão corretos e que sua rede não está bloqueando o Supabase.'}</div>
    `;
    
    const configContainer = document.querySelector('.config-container');
    configContainer.appendChild(errorAlert);
    lucide.createIcons();
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = originalText;
  }
}

function disconnectSupabase() {
  if (confirm('Tem certeza que deseja desconectar o banco de dados? Seus dados não serão perdidos, mas o painel ficará inativo.')) {
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_key');
    supabaseUrl = null;
    supabaseKey = null;
    supabaseClient = null;
    switchView('setup');
  }
}

async function logout() {
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn("SignOut failed:", e);
    }
  }
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('login-container').style.display = 'flex';
}

// Navigation
function switchView(viewName, element = null) {
  activeView = viewName;
  
  // Hide all views
  Object.keys(views).forEach(key => {
    if (views[key]) views[key].classList.remove('active');
  });
  
  // Update sidebar active state
  navItems.forEach(item => item.classList.remove('active'));
  
  if (element) {
    element.classList.add('active');
  } else {
    // Find active nav element manually if none provided
    const match = Array.from(navItems).find(item => item.getAttribute('onclick').includes(viewName));
    if (match) match.classList.add('active');
  }

  // Show/Hide period filter container depending on view
  const periodContainer = document.getElementById('global-period-container');
  if (periodContainer) {
    if (viewName === 'dashboard' || viewName === 'financeiro') {
      periodContainer.style.display = 'flex';
    } else {
      periodContainer.style.display = 'none';
    }
  }

  if (views[viewName]) {
    views[viewName].classList.add('active');
  }

  switch(viewName) {
    case 'dashboard':
      viewTitle.innerText = "Dashboard Geral";
      viewSubtitle.innerText = "HUB de gestão multiloja para sellers.";
      renderDashboardCharts();
      break;
    case 'financeiro':
      viewTitle.innerText = "Financeiro / DRE";
      viewSubtitle.innerText = "Visualização simplificada de lucro, margens e custos consolidados.";
      break;
    case 'estoque':
      viewTitle.innerText = "Estoque & Planejamento S&OP";
      viewSubtitle.innerText = "Sugestões de compra e alertas de ruptura baseados em demanda real.";
      break;
    case 'anuncios':
      viewTitle.innerText = "Analisador de Anúncios Shopee";
      viewSubtitle.innerText = "Auditoria de imagens, notas e conversão dos anúncios ativos.";
      break;
    case 'importer':
      viewTitle.innerText = "Importar Estoque (ETL)";
      viewSubtitle.innerText = "Atualize o Supabase carregando a planilha do UPSeller.";
      break;
    case 'config':
      viewTitle.innerText = "Configurações de Conexão";
      viewSubtitle.innerText = "Gerenciamento do token de comunicação Supabase.";
      break;
    case 'shopee-sync':
      viewTitle.innerText = "Integrações";
      viewSubtitle.innerText = "Acompanhe os canais e fluxos de dados conectados à sua empresa.";
      if (window.mavisIntegrations) window.mavisIntegrations.refresh();
      break;
  }
  
  lucide.createIcons();
}

// Data Fetching
async function loadAllData() {
  if (!supabaseClient) return;
  
  console.log("Iniciando carregamento modular de dados do Supabase...");

  const isFiltered = selectedShop !== 'all';
  const shopNum = Number(selectedShop);

  // 1. Fetch S&OP stock planning view
  try {
    const { data: stockPlanning, error: stockError } = await supabaseClient
      .from('vw_upseller_stock_planning')
      .select('*');
      
    if (stockError) throw stockError;
    stockPlanningData = stockPlanning || [];
    populateStockPlanningTable();
  } catch (err) {
    console.error("Erro ao carregar planejamento de estoque S&OP:", err);
    document.getElementById('stock-planning-tbody').innerHTML = `
      <tr>
        <td colspan="7" class="empty-placeholder" style="color: hsl(var(--color-danger));">
          <i data-lucide="alert-triangle"></i>
          <h3>Falha ao carregar planejamento de estoque</h3>
          <p>${escapeHTML(err.message)}</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
  }
  
  // 2. Fetch Shopee products
  try {
    let query = supabaseClient.from('shopee_products').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data: shopeeProducts, error: prodError } = await query;
      
    if (prodError) throw prodError;
    shopeeProductsData = shopeeProducts || [];
    populateListingsTable();
  } catch (err) {
    console.error("Erro ao carregar anúncios da Shopee:", err);
    document.getElementById('listings-tbody').innerHTML = `
      <tr>
        <td colspan="7" class="empty-placeholder" style="color: hsl(var(--color-danger));">
          <i data-lucide="alert-triangle"></i>
          <h3>Falha ao auditar anúncios</h3>
          <p>${escapeHTML(err.message)}</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
  }
  
  // 3. Fetch Financial Summary view
  try {
    let query = supabaseClient.from('vw_financial_summary').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data: finSummary, error: finSumError } = await query;
      
    if (finSumError) throw finSumError;
    
    // Consolidate Financial Summary view
    if (finSummary && finSummary.length > 0) {
      if (selectedShop === 'all') {
        financialSummaryData = {
          total_escrow_amount: finSummary.reduce((sum, f) => sum + Number(f.total_escrow_amount || 0), 0),
          total_commission_fee: finSummary.reduce((sum, f) => sum + Number(f.total_commission_fee || 0), 0),
          total_service_fee: finSummary.reduce((sum, f) => sum + Number(f.total_service_fee || 0), 0),
          total_wallet_amount: finSummary.reduce((sum, f) => sum + Number(f.total_wallet_amount || 0), 0),
          total_refund_amount: finSummary.reduce((sum, f) => sum + Number(f.total_refund_amount || 0), 0),
          total_ads_expense: finSummary.reduce((sum, f) => sum + Number(f.total_ads_expense || 0), 0),
          latest_ads_balance: finSummary.reduce((sum, f) => sum + Number(f.latest_ads_balance || 0), 0),
          processing_amount: finSummary.reduce((sum, f) => sum + Number(f.processing_amount || 0), 0),
          to_release_amount: finSummary.reduce((sum, f) => sum + Number(f.to_release_amount || 0), 0),
          released_amount: finSummary.reduce((sum, f) => sum + Number(f.released_amount || 0), 0),
          latest_wallet_balance: finSummary.reduce((sum, f) => sum + Number(f.latest_wallet_balance || 0), 0)
        };
      } else {
        financialSummaryData = finSummary[0] || null;
      }
    } else {
      financialSummaryData = null;
    }
    populateFinancialTable();
  } catch (err) {
    console.error("Erro ao carregar sumário financeiro:", err);
  }

  // 4. Fetch Financial Daily view
  try {
    let query = supabaseClient.from('vw_financial_daily').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data: finDaily, error: finDailyError } = await query
      .order('reference_date', { ascending: true })
      .limit(365);
      
    if (finDailyError) throw finDailyError;
    financialDailyData = finDaily || [];
  } catch (err) {
    console.error("Erro ao carregar histórico financeiro diário:", err);
  }
  
  // Fetch landed_cost_entries
  try {
    const { data: landedCosts, error: lcError } = await supabaseClient
      .from('landed_cost_entries')
      .select('*');
    if (!lcError) landedCostEntriesData = landedCosts || [];
  } catch (e) {
    console.error("Erro ao carregar landed costs:", e);
  }

  // Fetch vw_upseller_sku_daily_demand
  try {
    let query = supabaseClient.from('vw_upseller_sku_daily_demand').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data: demand, error: demError } = await query
      .order('order_date', { ascending: true });
    if (!demError) skuDailyDemandData = demand || [];
  } catch (e) {
    console.error("Erro ao carregar demanda de SKUs:", e);
  }

  // Fetch novas views (Catalog, Ads, Performance)
  try {
    let query = supabaseClient.from('vw_catalog_summary').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      if (selectedShop === 'all') {
        catalogSummaryData = {
          total_products: data.reduce((sum, c) => sum + Number(c.total_products || 0), 0),
          total_active: data.reduce((sum, c) => sum + Number(c.total_products || c.total_active || 0), 0),
          total_views: data.reduce((sum, c) => sum + Number(c.total_views || 0), 0),
          total_sales: data.reduce((sum, c) => sum + Number(c.total_sales || 0), 0),
          total_likes: data.reduce((sum, c) => sum + Number(c.total_likes || 0), 0),
          avg_rating_star: data.length > 0 ? (data.reduce((sum, c) => sum + Number(c.avg_rating_star || 0), 0) / data.length).toFixed(2) : 0
        };
      } else {
        catalogSummaryData = data[0] || null;
      }
    } else {
      catalogSummaryData = null;
    }
  } catch (e) {}

  try {
    let query = supabaseClient.from('vw_ads_summary').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      if (selectedShop === 'all') {
        adsSummaryData = {
          latest_total_balance: data.reduce((sum, a) => sum + Number(a.latest_total_balance || 0), 0),
          total_expense: data.reduce((sum, a) => sum + Number(a.total_expense || 0), 0),
          total_direct_gmv: data.reduce((sum, a) => sum + Number(a.total_direct_gmv || 0), 0),
          total_broad_gmv: data.reduce((sum, a) => sum + Number(a.total_broad_gmv || 0), 0),
          avg_direct_roas: data.reduce((sum, a) => sum + Number(a.total_expense || 0), 0) > 0 
            ? (data.reduce((sum, a) => sum + Number(a.total_direct_gmv || 0), 0) / data.reduce((sum, a) => sum + Number(a.total_expense || 0), 0)).toFixed(2)
            : 0
        };
      } else {
        adsSummaryData = data[0] || null;
      }
    } else {
      adsSummaryData = null;
    }
  } catch (e) {}

  try {
    let query = supabaseClient.from('vw_product_performance_summary').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data, error } = await query;
    if (!error) productPerformanceData = data || [];
  } catch (e) {}

  try {
    let query = supabaseClient.from('vw_wallet_balance_latest').select('*');
    if (isFiltered) {
      query = query.eq('shop_id', shopNum);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      if (selectedShop === 'all') {
        const totalBalance = data.reduce((sum, w) => sum + Number(w.current_balance || w.available_amount || 0), 0);
        walletData = { current_balance: totalBalance, available_amount: totalBalance };
      } else {
        walletData = data[0] || null;
      }
    } else {
      walletData = null;
    }
  } catch (e) {}

  // Render and build general UI widgets
  populateDashboardMetrics();
  generateDynamicTasks();
  renderDashboardCharts();
  
  // 5. Fetch and display latest stock import date
  try {
    const { data: latestImport, error: importDateError } = await supabaseClient
      .from('upseller_stock_imports')
      .select('imported_at')
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!importDateError && latestImport && latestImport.imported_at) {
      const date = new Date(latestImport.imported_at);
      const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} às ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      const placeholder = document.getElementById('last-stock-update');
      if (placeholder) {
        placeholder.innerHTML = `• <i data-lucide="clock" style="width: 13px; height: 13px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i> Último Update: <b>${escapeHTML(formattedDate)}</b>`;
      }
    }
  } catch (e) {
    console.warn("Could not load latest import timestamp", e);
  }
  
  // Check if data is empty (likely due to RLS active)
  const rlsBanner = document.getElementById('rls-alert-banner');
  if (rlsBanner) {
    if (stockPlanningData.length === 0 && shopeeProductsData.length === 0) {
      rlsBanner.style.display = 'block';
    } else {
      rlsBanner.style.display = 'none';
    }
  }
  
  console.log("Todos os dados carregados de forma modular!");
}

// Helper to check if a date string falls inside the active selectedPeriod range
function isDateInPeriod(dateStr, period) {
  if (!dateStr) return false;
  if (period === 'all') return true;
  
  // Parse date string (format YYYY-MM-DD)
  const refDate = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  if (period === 'month') {
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return refDate >= firstDayOfMonth && refDate <= now;
  }
  
  const daysLimit = parseInt(period);
  const cutoffDate = new Date();
  cutoffDate.setDate(now.getDate() - daysLimit);
  cutoffDate.setHours(0, 0, 0, 0);
  
  return refDate >= cutoffDate && refDate <= now;
}

// Helper to search and get real landed cost or backup purchase cost of a SKU
function getSKUUnitCost(sku, fallbackPrice = 0) {
  if (!sku) return fallbackPrice * 0.40;
  const cleanSku = String(sku).trim().toLowerCase();
  
  // 1. Look up in landed_cost_entries
  const landedEntry = landedCostEntriesData.find(entry => entry.sku && String(entry.sku).trim().toLowerCase() === cleanSku);
  if (landedEntry && landedEntry.landed_cost !== null && landedEntry.landed_cost !== undefined) {
    return Number(landedEntry.landed_cost);
  }
  
  // 2. Look up in stock planning data (average_cost)
  const stockEntry = stockPlanningData.find(item => item.sku && String(item.sku).trim().toLowerCase() === cleanSku);
  if (stockEntry) {
    if (stockEntry.average_cost !== null && stockEntry.average_cost !== undefined && Number(stockEntry.average_cost) > 0) {
      return Number(stockEntry.average_cost);
    }
    if (stockEntry.current_price !== null && stockEntry.current_price !== undefined) {
      return Number(stockEntry.current_price) * 0.40;
    }
  }
  
  return fallbackPrice > 0 ? fallbackPrice * 0.40 : 0;
}

// Compute aggregate metrics from daily data for the selected period
function getAggregatedMetrics() {
  let totalEscrow = 0;
  let totalComm = 0;
  let totalServ = 0;
  let totalRefund = 0;
  let totalAds = 0;
  let totalAdsGmv = 0;
  
  const filteredDaily = financialDailyData.filter(item => isDateInPeriod(item.reference_date, selectedPeriod));
  
  filteredDaily.forEach(item => {
    totalEscrow += Number(item.escrow_amount || 0);
    totalComm += Number(item.commission_fee || 0);
    totalServ += Number(item.service_fee || 0);
    totalRefund += Number(item.refund_amount || 0);
    totalAds += Number(item.ads_expense || 0);
    totalAdsGmv += Number(item.ads_direct_gmv || 0);
  });
  
  // Compute CMV for selected period from daily demand matching landed costs
  let totalCMV = 0;
  const filteredDemand = skuDailyDemandData.filter(item => isDateInPeriod(item.order_date, selectedPeriod));
  
  filteredDemand.forEach(item => {
    const stockItem = stockPlanningData.find(s => s.sku === item.sku);
    const fallbackPrice = stockItem ? Number(stockItem.current_price || 0) : 0;
    const unitCost = getSKUUnitCost(item.sku, fallbackPrice);
    totalCMV += Number(item.total_units_sold || 0) * unitCost;
  });
  
  const grossRevenue = totalEscrow + totalComm + totalServ;
  const netProfit = totalEscrow - totalAds - totalCMV; // Net Profit formula including exact CMV
  const netMargin = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(1) : '0.0';
  const avgRoas = totalAds > 0 ? (totalAdsGmv / totalAds).toFixed(2) : '0.00';
  
  // Group and sum daily metrics by date for chart rendering
  const dailyMap = {};
  filteredDaily.forEach(item => {
    const d = item.reference_date;
    if (!dailyMap[d]) {
      dailyMap[d] = {
        reference_date: d,
        escrow_amount: 0,
        commission_fee: 0,
        service_fee: 0,
        refund_amount: 0,
        ads_expense: 0,
        ads_direct_gmv: 0,
        wallet_amount: 0
      };
    }
    dailyMap[d].escrow_amount += Number(item.escrow_amount || 0);
    dailyMap[d].commission_fee += Number(item.commission_fee || 0);
    dailyMap[d].service_fee += Number(item.service_fee || 0);
    dailyMap[d].refund_amount += Number(item.refund_amount || 0);
    dailyMap[d].ads_expense += Number(item.ads_expense || 0);
    dailyMap[d].ads_direct_gmv += Number(item.ads_direct_gmv || 0);
    dailyMap[d].wallet_amount += Number(item.wallet_amount || item.escrow_amount || 0);
  });
  const consolidatedDaily = Object.values(dailyMap).sort((a, b) => a.reference_date.localeCompare(b.reference_date));

  return {
    totalEscrow,
    totalComm,
    totalServ,
    totalRefund,
    totalAds,
    totalCMV,
    grossRevenue,
    netProfit,
    netMargin,
    avgRoas,
    filteredDaily: consolidatedDaily
  };
}

// Filter triggers on dropdown selection change
function filterDataByPeriod(period) {
  selectedPeriod = period;
  populateDashboardMetrics();
  populateFinancialTable();
  renderDashboardCharts();
}

// Populate Dashboard Cards
function populateDashboardMetrics() {
  if (financialDailyData.length === 0 && !financialSummaryData) return;
  
  const metrics = getAggregatedMetrics();
  
  // Count rupture stocks
  const stockRuptures = stockPlanningData.filter(item => item.needs_replenishment === true).length;
  
  // Format and insert into DOM
  document.getElementById('card-faturamento').innerText = formatCurrency(metrics.grossRevenue);
  document.getElementById('card-lucro').innerText = formatCurrency(metrics.netProfit);
  document.getElementById('card-ads').innerText = formatCurrency(metrics.totalAds);
  document.getElementById('sub-roas').innerHTML = `<span class="trend-up"><i data-lucide="percent"></i> ROAS: ${escapeHTML(metrics.avgRoas)}</span> no período`;
  document.getElementById('card-estoque-alert').innerText = stockRuptures;
  
  // New Cards
  if (walletData) {
    document.getElementById('card-wallet').innerText = formatCurrency(walletData.available_amount || 0);
  }
  if (catalogSummaryData) {
    document.getElementById('card-catalog').innerText = catalogSummaryData.total_active || 0;
    document.getElementById('sub-catalog').innerHTML = `<i data-lucide="eye"></i> ${catalogSummaryData.total_views || 0} views / ${catalogSummaryData.total_sales || 0} vendas`;
  }

  // Badges status
  document.getElementById('stock-danger-badge').innerText = `${stockRuptures} Rupturas/Críticos`;
  document.getElementById('stock-ok-badge').innerText = `${stockPlanningData.length - stockRuptures} SKUs Ok`;
  
  lucide.createIcons();
}

// Task Engine: Generate Priority Tasks dynamically
function generateDynamicTasks() {
  const container = document.getElementById('dashboard-tasks');
  const countBadge = document.getElementById('task-count-badge');
  container.innerHTML = '';
  
  let generatedTasks = [];
  
  // 1. Stock replenishment tasks from S&OP View
  const criticalStock = stockPlanningData
    .filter(item => item.needs_replenishment === true)
    .sort((a, b) => Number(b.critical_sort_value || 0) - Number(a.critical_sort_value || 0));
    
  criticalStock.slice(0, 3).forEach(item => {
    const taskId = `stock_${item.sku}`;
    if (!localCompletedTasks.includes(taskId)) {
      generatedTasks.push({
        id: taskId,
        category: 'estoque',
        title: `Repor Estoque: SKU ${escapeHTML(item.sku)}`,
        desc: `O produto <b>${escapeHTML(item.product_title || 'Importado')}</b> está com cobertura de apenas ${Math.round(item.coverage_days || 0)} dias. Sugestão: comprar ${Math.round(item.suggested_purchase_qty || 0)} un.`,
        priority: 'Alta'
      });
    }
  });
  
  // 2. Listing improvement tasks from shopee_products
  const poorListings = shopeeProductsData
    .filter(item => Number(item.rating_star || 5) < 4.5 && Number(item.rating_count || 0) > 0)
    .sort((a, b) => Number(a.rating_star) - Number(b.rating_star));
    
  poorListings.slice(0, 2).forEach(item => {
    const taskId = `listing_${item.item_id}`;
    if (!localCompletedTasks.includes(taskId)) {
      generatedTasks.push({
        id: taskId,
        category: 'anuncio',
        title: `Aprimorar Anúncio: ${escapeHTML(item.item_sku || String(item.item_id))}`,
        desc: `O anúncio está com reputação média de <b>${Number(item.rating_star).toFixed(1)} estrelas</b> (${item.rating_count} avaliações). Analise os comentários ruins e responda os clientes.`,
        priority: 'Média'
      });
    }
  });

  // 3. Inactive/Dead Stock check
  const deadStock = stockPlanningData
    .filter(item => Number(item.reported_stock_qty || 0) > 40 && Number(item.units_sold_30d || 0) === 0);
    
  deadStock.slice(0, 1).forEach(item => {
    const taskId = `dead_${item.sku}`;
    if (!localCompletedTasks.includes(taskId)) {
      generatedTasks.push({
        id: taskId,
        category: 'estoque',
        title: `Liquidar Estoque Parado: SKU ${escapeHTML(item.sku)}`,
        desc: `O produto <b>${escapeHTML(item.product_title || 'Sem Nome')}</b> tem ${Math.round(item.reported_stock_qty)} unidades no estoque, mas vendeu 0 nos últimos 30 dias. Crie promoções.`,
        priority: 'Baixa'
      });
    }
  });

  // 4. Missing Video or bad photo dimension audit
  const missingMedia = shopeeProductsData
    .filter(item => !item.image_url)
    .slice(0, 1);
    
  missingMedia.forEach(item => {
    const taskId = `media_${item.item_id}`;
    if (!localCompletedTasks.includes(taskId)) {
      generatedTasks.push({
        id: taskId,
        category: 'anuncio',
        title: `Inserir Imagem do Anúncio ID: ${escapeHTML(String(item.item_id))}`,
        desc: `O produto <b>${escapeHTML(item.item_name.substring(0, 30))}...</b> está sem imagem de capa sincronizada. Atualize o anúncio no marketplace.`,
        priority: 'Média'
      });
    }
  });

  // Render tasks
  if (generatedTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <i data-lucide="check" style="color: #10b981;"></i>
        <h3>Tudo em dia!</h3>
        <p>Você não tem nenhuma tarefa ou ruptura pendente para hoje.</p>
      </div>
    `;
    countBadge.innerText = "0 pendentes";
    countBadge.className = "task-badge excellent";
  } else {
    countBadge.innerText = `${generatedTasks.length} pendentes`;
    countBadge.className = "task-badge";
    
    generatedTasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'task-item';
      item.innerHTML = `
        <div class="task-details">
          <div class="task-icon-bg ${task.category}">
            <i data-lucide="${task.category === 'estoque' ? 'package' : 'line-chart'}"></i>
          </div>
          <div class="task-info">
            <h4>${task.title} <span style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background-color: rgba(255,255,255,0.05); margin-left: 6px; font-weight: 500;">${task.priority}</span></h4>
            <p>${task.desc}</p>
          </div>
        </div>
        <div class="task-actions">
          <button class="task-btn complete" onclick="completeTask('${task.id}')">Concluído</button>
        </div>
      `;
      container.appendChild(item);
    });
  }
  
  lucide.createIcons();
}

function completeTask(taskId) {
  localCompletedTasks.push(taskId);
  localStorage.setItem('completed_tasks', JSON.stringify(localCompletedTasks));
  generateDynamicTasks();
}

// Populate S&OP Stock planning view
function populateStockPlanningTable() {
  const tbody = document.getElementById('stock-planning-tbody');
  tbody.innerHTML = '';
  
  const displayData = selectedShop === 'all' 
    ? stockPlanningData 
    : stockPlanningData.filter(item => {
        const prod = shopeeProductsData.find(p => String(p.item_id) === String(item.item_id));
        return prod && String(prod.shop_id) === String(selectedShop);
      });

  if (displayData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-placeholder">Nenhum registro de estoque encontrado no Supabase.</td>
      </tr>
    `;
    return;
  }
  
  displayData.forEach(item => {
    const stock = Math.round(Number(item.reported_stock_qty || item.available_qty || 0));
    const vmd = Number(item.avg_daily_units_30d || 0).toFixed(2);
    const coverage = item.coverage_days ? Math.round(Number(item.coverage_days)) : '∞';
    const suggest = Math.round(Number(item.suggested_purchase_qty || 0));
    
    // Status color
    let statusClass = 'excellent';
    let statusText = 'Estável';
    if (item.needs_replenishment) {
      statusClass = 'poor';
      statusText = 'Ruptura / Crítico';
    } else if (coverage !== '∞' && coverage < 30) {
      statusClass = 'good';
      statusText = 'Alerta Médio';
    }
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight: 600; color: hsl(var(--color-primary));">${escapeHTML(item.sku)}</td>
      <td>${escapeHTML(item.product_title || 'Produto sem título')}</td>
      <td style="text-align: right; font-weight: 500;">${stock} un</td>
      <td style="text-align: right;">${vmd} un/dia</td>
      <td style="text-align: right; font-weight: 500;">${coverage} dias</td>
      <td><span class="score-pill ${statusClass}">${statusText}</span></td>
      <td style="text-align: right; font-weight: 600; color: ${suggest > 0 ? 'hsl(var(--color-warning))' : 'inherit'}">${suggest > 0 ? suggest + ' un' : '-'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Populate Listing Quality Audit Table
function populateListingsTable() {
  const tbody = document.getElementById('listings-tbody');
  tbody.innerHTML = '';
  
  if (shopeeProductsData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-placeholder">Nenhum anúncio da Shopee sincronizado.</td>
      </tr>
    `;
    return;
  }
  
  shopeeProductsData.forEach(item => {
    const views = Number(item.views || 0);
    const sales = Number(item.sales || 0);
    const rating = Number(item.rating_star || 0).toFixed(1);
    
    // Calculate a dynamic score (0 to 100) based on attributes
    let score = 40; // Base score
    let optimizations = [];
    
    if (item.image_url) {
      score += 30;
    } else {
      optimizations.push("Falta imagem de capa");
    }
    
    if (Number(rating) >= 4.5) {
      score += 20;
    } else if (Number(rating) > 0) {
      optimizations.push("Nota média abaixo de 4.5");
    }
    
    if (sales > 10) {
      score += 10;
    }
    
    score = Math.min(score, 100);
    
    let scoreClass = 'poor';
    if (score >= 80) scoreClass = 'excellent';
    else if (score >= 60) scoreClass = 'good';
    
    if (optimizations.length === 0) {
      optimizations.push("Excelente! Nenhuma falha.");
    }
    
    const shop = userShops.find(s => String(s.shop_id) === String(item.shop_id));
    const shopLabel = shop ? `<span style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background-color: rgba(139, 92, 246, 0.15); color: #a78bfa; margin-left: 6px; font-weight: 500;">${escapeHTML(shop.shop_name)}</span>` : '';
    
    const row = document.createElement('tr');
    row.setAttribute('onclick', `openProductOptimizer('${item.item_id}')`);
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <td><img src="${escapeHTML(item.image_url || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=80&auto=format&fit=crop&q=60')}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 1px solid hsl(var(--border-color));" alt="Capa"></td>
      <td>
        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
          <span style="font-weight: 600; color: white;">${escapeHTML(item.item_sku || 'Sem SKU')}</span>
          ${shopLabel}
        </div>
        <div style="font-size: 0.75rem; color: hsl(var(--text-secondary)); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(item.item_name)}</div>
      </td>
      <td style="text-align: right;">${views}</td>
      <td style="text-align: right; font-weight: 500;">${sales} un</td>
      <td style="text-align: right; font-weight: 500; color: #f59e0b;"><i data-lucide="star" style="width: 12px; height: 12px; display: inline; fill: #f59e0b;"></i> ${rating}</td>
      <td><span class="score-pill ${scoreClass}">${score}% Score</span></td>
      <td style="font-size: 0.8rem; color: ${score < 80 ? 'hsl(var(--color-warning))' : 'hsl(var(--text-muted))'};">${escapeHTML(optimizations.join(', '))}</td>
    `;
    tbody.appendChild(row);
  });
  
  lucide.createIcons();
}

// Populate Financial table (DRE view)
function populateFinancialTable() {
  if (financialDailyData.length === 0 && !financialSummaryData) return;
  
  const metrics = getAggregatedMetrics();
  
  // DRE bindings
  document.getElementById('dre-faturamento').innerText = formatCurrency(metrics.grossRevenue);
  document.getElementById('dre-comissoes').innerText = `-${formatCurrency(metrics.totalComm)}`;
  document.getElementById('dre-comissoes-pct').innerText = metrics.grossRevenue > 0 ? `-${(metrics.totalComm / metrics.grossRevenue * 100).toFixed(1)}% do faturamento` : '0.0%';
  document.getElementById('dre-servicos').innerText = `-${formatCurrency(metrics.totalServ)}`;
  document.getElementById('dre-servicos-pct').innerText = metrics.grossRevenue > 0 ? `-${(metrics.totalServ / metrics.grossRevenue * 100).toFixed(1)}% do faturamento` : '0.0%';
  
  document.getElementById('dre-escrow').innerText = formatCurrency(metrics.totalEscrow);
  document.getElementById('dre-ads').innerText = `-${formatCurrency(metrics.totalAds)}`;
  document.getElementById('dre-ads-pct').innerText = metrics.grossRevenue > 0 ? `-${(metrics.totalAds / metrics.grossRevenue * 100).toFixed(1)}% investido em Ads` : '0.0%';
  document.getElementById('dre-reembolsos').innerText = `-${formatCurrency(metrics.totalRefund)}`;
  
  // CMV Bindings
  document.getElementById('dre-cmv').innerText = `-${formatCurrency(metrics.totalCMV)}`;
  document.getElementById('dre-cmv-pct').innerText = metrics.grossRevenue > 0 ? `-${(metrics.totalCMV / metrics.grossRevenue * 100).toFixed(1)}% do faturamento` : '0.0%';
  
  document.getElementById('dre-lucro-liquido').innerText = formatCurrency(metrics.netProfit);
  document.getElementById('dre-lucro-pct').innerText = `${metrics.netMargin}% Margem Líquida`;
}

// Render Dashboard ApexCharts
let salesChart = null;
let productsChart = null;

function renderDashboardCharts() {
  if (activeView !== 'dashboard') return;
  
  const metrics = getAggregatedMetrics();
  const filteredDaily = metrics.filteredDaily;
  
  // 1. Sales & Expenses Chart (DRE overview daily)
  const chartSalesEl = document.querySelector("#chart-sales");
  if (chartSalesEl && filteredDaily.length > 0) {
    chartSalesEl.innerHTML = '';
    
    const dates = filteredDaily.map(item => formatDate(item.reference_date));
    const escrow = filteredDaily.map(item => Number(item.wallet_amount || item.escrow_amount || 0));
    const ads = filteredDaily.map(item => Number(item.ads_expense || 0));
    
    const options = {
      series: [{
        name: 'Repasses Recebidos',
        data: escrow
      }, {
        name: 'Gasto em Ads',
        data: ads
      }],
      chart: {
        type: 'area',
        height: 300,
        toolbar: { show: false },
        background: 'transparent'
      },
      colors: ['#8b5cf6', '#ef4444'],
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      theme: { mode: 'dark' },
      grid: { borderColor: '#1e293b' },
      xaxis: { categories: dates }
    };
    
    salesChart = new ApexCharts(chartSalesEl, options);
    salesChart.render();
  } else if (chartSalesEl) {
    chartSalesEl.innerHTML = '<div class="empty-placeholder">Insira mais dados de pedidos na shopee diários para carregar o gráfico.</div>';
  }

  // 2. Products Top Sales Chart
  const chartProductsEl = document.querySelector("#chart-products");
  if (chartProductsEl && shopeeProductsData.length > 0) {
    chartProductsEl.innerHTML = '';
    
    // Sort and take top 5
    const topProducts = [...shopeeProductsData]
      .sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0))
      .slice(0, 5);
      
    const names = topProducts.map(item => item.item_sku || item.item_name.substring(0, 10));
    const sales = topProducts.map(item => Number(item.sales || 0));
    
    const options = {
      series: [{
        data: sales
      }],
      chart: {
        type: 'bar',
        height: 300,
        toolbar: { show: false },
        background: 'transparent'
      },
      plotOptions: {
        bar: {
          borderRadius: 4,
          horizontal: true,
        }
      },
      colors: ['#10b981'],
      theme: { mode: 'dark' },
      grid: { borderColor: '#1e293b' },
      xaxis: { categories: names }
    };
    
    productsChart = new ApexCharts(chartProductsEl, options);
    productsChart.render();
  } else if (chartProductsEl) {
    chartProductsEl.innerHTML = '<div class="empty-placeholder">Nenhum produto cadastrado para montar o gráfico.</div>';
  }
}

// Utility formatting functions
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

// ==========================================
// S&OP STOCK SPREADSHEET IMPORTER (ETL) LOGIC
// ==========================================

let uploadedRows = [];
let uploadedHeaders = [];
let selectedFile = null;

// Drag & drop event bindings
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  // Toggle dragover highlighting styles
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('dragover');
    }, false);
  });

  // Handle dropped files
  dropZone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });
}

function triggerFileInput() {
  document.getElementById('file-input').click();
}

function handleFileSelect(event) {
  const files = event.target.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

// Read and parse spreadsheet using SheetJS
function handleFile(file) {
  selectedFile = file;
  
  const titleEl = document.getElementById('upload-status-title');
  const descEl = document.getElementById('upload-status-desc');
  const iconEl = document.getElementById('upload-icon');
  
  titleEl.innerText = "Lendo e processando planilha...";
  descEl.innerText = `Processando: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  iconEl.className = "spin";
  iconEl.setAttribute('data-lucide', 'loader-2');
  lucide.createIcons();

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Load first sheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Parse as raw JSON array
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length < 2) {
        throw new Error("A planilha parece estar vazia ou não contém dados suficientes.");
      }
      
      // Header row
      uploadedHeaders = jsonData[0].map(h => String(h || '').trim());
      
      // Map data rows as objects
      uploadedRows = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row.length === 0 || row.every(val => val === null || val === undefined || val === '')) continue;
        
        let rowObj = {};
        uploadedHeaders.forEach((header, idx) => {
          rowObj[header] = row[idx] !== undefined ? row[idx] : null;
        });
        uploadedRows.push(rowObj);
      }
      
      titleEl.innerText = "Planilha carregada com sucesso!";
      descEl.innerText = `Pronto para mapear: ${file.name} (${uploadedRows.length} linhas encontradas)`;
      iconEl.className = "";
      iconEl.setAttribute('data-lucide', 'check-circle');
      iconEl.style.color = "hsl(var(--color-success))";
      lucide.createIcons();

      // Show Column Mapper Panel
      renderColumnMapper();
      // Show Data Preview Panel
      renderDataPreview(jsonData.slice(0, 6)); // Display first 5 rows
    } catch (err) {
      console.error(err);
      titleEl.innerText = "Falha ao ler planilha";
      descEl.innerText = "Erro: " + err.message;
      iconEl.className = "";
      iconEl.setAttribute('data-lucide', 'alert-circle');
      iconEl.style.color = "hsl(var(--color-danger))";
      lucide.createIcons();
    }
  };
  
  reader.readAsArrayBuffer(file);
}

// Dynamic smart column mapper (Adapter Pattern)
const targetColumns = [
  { key: 'sku', label: 'SKU / Código do Produto', desc: 'Identificador único do SKU', required: true, synonyms: ['sku', 'código', 'codigo', 'referência', 'referencia'] },
  { key: 'product_title', label: 'Título do Produto', desc: 'Nome ou título cadastrado', required: false, synonyms: ['produto', 'título', 'titulo', 'nome', 'designação', 'designacao', 'descrição'] },
  { key: 'available_qty', label: 'Estoque Disponível', desc: 'Quantidade livre para venda', required: true, synonyms: ['disponível', 'disponivel', 'estoque', 'físico', 'fisico', 'saldo', 'quantidade'] },
  { key: 'average_cost', label: 'Custo Unitário Médio', desc: 'Preço de custo pago pelo item', required: false, synonyms: ['custo', 'custo médio', 'preco custo', 'valor compra', 'médio'] },
  { key: 'warehouse_name', label: 'Nome do Armazém', desc: 'Nome da filial ou depósito', required: false, synonyms: ['armazém', 'armazem', 'depósito', 'deposito', 'filial'] },
  { key: 'subtotal_cost', label: 'Subtotal Custo', desc: 'Custo total (Estoque * Custo Médio)', required: false, synonyms: ['subtotal', 'total custo', 'valor total'] }
];

function renderColumnMapper() {
  const panel = document.getElementById('mapper-panel');
  const container = document.getElementById('mapping-rows-container');
  container.innerHTML = '';
  
  panel.style.display = 'block';

  targetColumns.forEach(target => {
    // Smart auto-match logic
    let matchedHeader = '';
    for (let synonym of target.synonyms) {
      const match = uploadedHeaders.find(h => h.toLowerCase().includes(synonym));
      if (match) {
        matchedHeader = match;
        break;
      }
    }
    
    // Create options
    let optionsHtml = `<option value="">-- Ignorar Campo --</option>`;
    uploadedHeaders.forEach(header => {
      const selected = header === matchedHeader ? 'selected' : '';
      optionsHtml += `<option value="${header}" ${selected}>${header}</option>`;
    });

    const row = document.createElement('div');
    row.className = 'mapping-row';
    row.innerHTML = `
      <div class="db-field-label">
        ${target.label} ${target.required ? '<span style="color:hsl(var(--color-danger)); display:inline;">*</span>' : ''}
        <span>${target.desc}</span>
      </div>
      <div class="mapping-arrow"><i data-lucide="arrow-right"></i></div>
      <div>
        <select class="select-field col-mapping-select" data-target="${target.key}" data-required="${target.required}">
          ${optionsHtml}
        </select>
      </div>
    `;
    container.appendChild(row);
  });
  
  lucide.createIcons();
}

// Render dynamic preview table of parsed sheet rows
function renderDataPreview(previewRows) {
  const panel = document.getElementById('preview-panel');
  const table = document.getElementById('table-import-preview');
  table.innerHTML = '';
  
  panel.style.display = 'block';

  // Headers
  let headerHtml = '<tr>';
  uploadedHeaders.forEach(h => {
    headerHtml += `<th>${h}</th>`;
  });
  headerHtml += '</tr>';
  
  // Body
  let bodyHtml = '';
  for (let i = 1; i < previewRows.length; i++) {
    const row = previewRows[i];
    bodyHtml += '<tr>';
    uploadedHeaders.forEach((h, idx) => {
      bodyHtml += `<td>${row[idx] !== undefined && row[idx] !== null ? row[idx] : '-'}</td>`;
    });
    bodyHtml += '</tr>';
  }

  table.innerHTML = `
    <thead>${headerHtml}</thead>
    <tbody>${bodyHtml}</tbody>
  `;
}

function resetImporter() {
  uploadedRows = [];
  uploadedHeaders = [];
  selectedFile = null;
  
  document.getElementById('mapper-panel').style.display = 'none';
  document.getElementById('preview-panel').style.display = 'none';
  document.getElementById('import-progress-container').style.display = 'none';
  
  const titleEl = document.getElementById('upload-status-title');
  const descEl = document.getElementById('upload-status-desc');
  const iconEl = document.getElementById('upload-icon');
  
  titleEl.innerText = "Arraste e solte sua planilha do UPSeller aqui";
  descEl.innerText = "Suporta formatos .xlsx, .xls e .csv (Máx: 10MB)";
  iconEl.className = "";
  iconEl.style.color = "inherit";
  iconEl.setAttribute('data-lucide', 'file-spreadsheet');
  
  document.getElementById('file-input').value = '';
  lucide.createIcons();
}

// Insert into Supabase with beautiful visual feedback progress bar
async function executeImport() {
  if (!supabaseClient) {
    alert("Supabase não configurado.");
    return;
  }

  // Read mapping selects
  const selects = document.querySelectorAll('.col-mapping-select');
  let mappings = {};
  let missingRequired = false;

  selects.forEach(select => {
    const target = select.getAttribute('data-target');
    const required = select.getAttribute('data-required') === 'true';
    const val = select.value;

    if (required && !val) {
      missingRequired = true;
    }
    mappings[target] = val;
  });

  if (missingRequired) {
    alert("Por favor, mapeie todos os campos obrigatórios marcados com asterisco (*)!");
    return;
  }

  const progressContainer = document.getElementById('import-progress-container');
  const progressFill = document.getElementById('import-progress-fill');
  const progressPct = document.getElementById('import-progress-pct');
  const progressStatus = document.getElementById('import-progress-status');
  
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressPct.innerText = '0%';
  progressStatus.innerText = 'Registrando lote de importação no Supabase...';

  try {
    // 1. Create a record in `upseller_stock_imports` to obtain import_id
    const fileName = selectedFile ? selectedFile.name : 'Planilha_Importada.xlsx';
    
    const { data: importRecord, error: importError } = await supabaseClient
      .from('upseller_stock_imports')
      .insert([{
        source_file_name: fileName,
        file_hash: 'hash_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sku_count: uploadedRows.length,
        imported_at: new Date().toISOString()
      }])
      .select('id')
      .single();

    if (importError) throw importError;
    const importId = importRecord.id;

    // 2. Prepare snapshots rows in chunks
    const snapshotRows = uploadedRows.map((row, index) => {
      // Map columns values
      const sku = String(row[mappings.sku] || '').trim();
      const productTitle = mappings.product_title ? String(row[mappings.product_title] || '') : 'Produto Importado';
      const availableQty = mappings.available_qty ? Number(row[mappings.available_qty] || 0) : 0;
      const currentStock = availableQty; // Mapped directly
      const avgCost = mappings.average_cost ? Number(row[mappings.average_cost] || 0) : 0;
      const subtotal = mappings.subtotal_cost ? Number(row[mappings.subtotal_cost] || (currentStock * avgCost)) : (currentStock * avgCost);
      const warehouse = mappings.warehouse_name ? String(row[mappings.warehouse_name] || 'Geral') : 'Geral';

      return {
        import_id: importId,
        sku: sku,
        product_title: productTitle,
        warehouse_name: warehouse,
        source_sheet: 'Plan1',
        source_row_number: index + 2,
        available_qty: availableQty,
        current_stock_qty: currentStock,
        average_cost: avgCost,
        subtotal_cost: subtotal,
        imported_at: new Date().toISOString()
      };
    }).filter(row => row.sku.length > 0); // Ignore rows with empty SKU

    // Chunk uploads to bypass Supabase single insert limitations (50 rows per batch)
    const chunkSize = 50;
    const totalChunks = Math.ceil(snapshotRows.length / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      const chunk = snapshotRows.slice(start, end);
      
      progressStatus.innerText = `Fazendo upload do lote ${i + 1} de ${totalChunks}...`;
      const pct = Math.round(((i) / totalChunks) * 100);
      progressFill.style.width = `${pct}%`;
      progressPct.innerText = `${pct}%`;

      const { error: snapError } = await supabaseClient
        .from('upseller_stock_snapshot')
        .insert(chunk);

      if (snapError) throw snapError;
    }

    // Success! Finish progress bar
    progressFill.style.width = '100%';
    progressPct.innerText = '100%';
    progressStatus.innerText = 'Estoque atualizado com sucesso!';
    progressStatus.style.color = "hsl(var(--color-success))";

    setTimeout(async () => {
      alert(`Sucesso! ${snapshotRows.length} SKUs foram importados e sincronizados.`);
      resetImporter();
      // Reload all data
      await loadAllData();
      // Switch view back to Stock planning tab
      switchView('estoque');
    }, 1000);

  } catch (error) {
    console.error("Erro na importação:", error);
    alert("Falha ao salvar os dados no Supabase. Detalhes: " + error.message);
    progressStatus.innerText = 'Erro ao processar importação.';
    progressStatus.style.color = "hsl(var(--color-danger))";
  }
}

// ==========================================
// INTEGRAÇÃO SHOPEE API (EDGE FUNCTION)
// ==========================================

let edgeFunctionUrl = localStorage.getItem('shopee_edge_url') || '';

function saveEdgeUrl() {
  const url = document.getElementById('shopee-edge-url').value.trim();
  if (url) {
    localStorage.setItem('shopee_edge_url', url);
    edgeFunctionUrl = url;
    alert("URL salva com sucesso!");
  }
}

async function initShopeeSync() {
  if (edgeFunctionUrl) {
    document.getElementById('shopee-edge-url').value = edgeFunctionUrl;
  }
  
  await fetchSyncHealth();
  await fetchSyncLogsAndModules();
  await fetchUserShops();
}

function shopSelectorLabel(shop) {
  const id = String(shop.shop_id || '');
  const base = String(shop.shop_name || '').trim();
  const duplicate = base && userShops.filter(item =>
    String(item.shop_name || '').trim().toLowerCase() === base.toLowerCase()
  ).length > 1;
  const generic = !base || /^loja principal$/i.test(base) || /^loja conectada$/i.test(base);
  const name = generic || duplicate ? `Shopee · Loja ${id}` : base;
  if (shop.connection_status === 'legacy_pending_reauth') return `${name} — histórico`;
  if (shop.connection_status === 'active') return `${name} — conectada`;
  return name;
}

function renderMarketplaceScope() {
  const banner = document.getElementById('marketplace-scope-banner');
  if (!banner) return;
  const selected = userShops.find(shop => String(shop.shop_id) === String(selectedShop));
  const pending = userShops.filter(shop => shop.connection_status === 'legacy_pending_reauth');
  let title = '';
  let message = '';

  if (selectedShop === 'all' && pending.length) {
    title = 'O consolidado inclui dados históricos';
    message = `${pending.length} loja${pending.length === 1 ? '' : 's'} Shopee ainda precisa${pending.length === 1 ? '' : 'm'} ser reautorizada${pending.length === 1 ? '' : 's'} para voltar a atualizar.`;
  } else if (selected && selected.connection_status === 'legacy_pending_reauth') {
    title = 'Visualização de dados históricos';
    message = `${shopSelectorLabel(selected).replace(/ — histórico$/, '')} está sem atualização automática até a reautorização.`;
  } else if (selected && selected.connection_status === 'active') {
    title = 'Loja conectada';
    message = `${shopSelectorLabel(selected).replace(/ — conectada$/, '')} está autorizada para atualização automática.`;
  }

  banner.classList.toggle('is-visible', Boolean(title));
  banner.innerHTML = title ? `<div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>` +
    `<button type="button" onclick="switchView('shopee-sync')">Gerenciar lojas</button>` : '';
}

function renderShopSelector() {
  const shopSelect = document.getElementById('select-shop');
  if (!shopSelect) return;
  const currentVal = selectedShop;
  shopSelect.innerHTML = '<option value="all">Todas as Lojas (Consolidado)</option>';
  userShops.forEach(shop => {
    const opt = document.createElement('option');
    opt.value = shop.shop_id;
    opt.innerText = shopSelectorLabel(shop);
    opt.selected = String(currentVal) === String(shop.shop_id);
    shopSelect.appendChild(opt);
  });
  renderMarketplaceScope();
}

window.addEventListener('mavis:shop-connections-updated', event => {
  const detail = event.detail || {};
  if (detail.environment && detail.environment !== 'live') return;
  const connections = Array.isArray(detail.connections) ? detail.connections : [];
  userShops = connections
    .filter(connection => connection.status !== 'revoked')
    .map(connection => ({
      shop_id: connection.shop_id,
      shop_name: connection.shop_name,
      updated_at: connection.last_sync_at,
      connection_status: connection.status,
      connection_id: connection.id
    }));
  if (selectedShop !== 'all' && !userShops.some(shop => String(shop.shop_id) === String(selectedShop))) {
    selectedShop = 'all';
  }
  renderShopSelector();
  renderShopsList();
});

async function fetchUserShops() {
  if (!supabaseClient) return;
  
  const shopSelect = document.getElementById('select-shop');
  if (!shopSelect) return;
  
  try {
    const session = (await supabaseClient.auth.getSession()).data.session;
    const token = session ? session.access_token : '';
    
    if (edgeFunctionUrl && token) {
      const res = await fetch(edgeFunctionUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          userShops = data.shops || [];
          window.shopeeOauthUrl = data.oauthUrl || ""; // cache oauth URL globally
        }
      }
    }
    
    // Fallback if edge function fetch failed or returned empty
    if (userShops.length === 0) {
      const { data, error } = await supabaseClient
        .from('shopee_shops_safe')
        .select('shop_id, shop_name, updated_at')
        .order('shop_name', { ascending: true });
      if (!error && data) {
        userShops = data;
      }
    }
    
    // Update shop selector dropdown
    renderShopSelector();
    
    renderShopsList();
  } catch (err) {
    console.error("Erro ao buscar lojas do usuário:", err);
  }
}

function renderShopsList() {
  const container = document.getElementById('shopee-shops-list');
  if (!container) return;
  
  if (userShops.length === 0) {
    container.innerHTML = `
      <div style="background-color: rgba(255, 255, 255, 0.01); border: 1px dashed hsl(var(--border-color)); padding: 24px; border-radius: 12px; text-align: center; color: hsl(var(--text-secondary)); font-size: 0.85rem;">
        Nenhuma conta Shopee vinculada ainda. Use o formulário abaixo para conectar.
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  userShops.forEach(shop => {
    const card = document.createElement('div');
    card.className = 'panel-card';
    card.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid hsl(var(--border-color)); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
    
    const isCurrent = String(selectedShop) === String(shop.shop_id);
    if (isCurrent) {
      card.style.borderColor = 'hsl(var(--color-primary))';
    }
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="background-color: rgba(139, 92, 246, 0.1); color: #8b5cf6; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
          <i data-lucide="store"></i>
        </div>
        <div>
          <h4 style="font-weight: 600; color: white;">${escapeHTML(shop.shop_name)}</h4>
          <p style="color: hsl(var(--text-secondary)); font-size: 0.75rem;">Shop ID: ${shop.shop_id} ${shop.updated_at ? `• Atualizado: ${new Date(shop.updated_at).toLocaleDateString('pt-BR')}` : ''}</p>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        ${isCurrent ? `
          <span style="font-size: 0.75rem; background-color: rgba(16, 185, 129, 0.15); color: #10b981; padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; font-weight: 600;">
            Ativa
          </span>
        ` : `
          <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; background: rgba(255,255,255,0.05); border: 1px solid hsl(var(--border-color)); color: white; width: auto;" onclick="filterDataByShop('${shop.shop_id}')">
            Ativar
          </button>
        `}
        <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; background: linear-gradient(135deg, hsl(var(--color-danger)), #ff4f4f); border: none; color: white; width: auto;" onclick="deleteShop('${shop.shop_id}')">
          Desvincular
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  
  lucide.createIcons();
}

async function handleOAuthRedirect(code, shopId) {
  if (!edgeFunctionUrl) {
    alert("Atenção: Retorno de autorização da Shopee detectado, mas a URL da Edge Function não está configurada! Configure-a nas configurações da Shopee para completar a vinculação.");
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }
  
  const shopName = prompt(`Nova loja Shopee autorizada com sucesso! \nShop ID: ${shopId}\n\nPor favor, defina um apelido amigável para esta loja (ex: Loja Roupas, Loja SP):`);
  if (!shopName) {
    alert("Vinculação cancelada. O apelido é obrigatório para cadastrar a loja.");
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }
  
  // Visual loader
  const listContainer = document.getElementById('shopee-shops-list');
  if (listContainer) {
    listContainer.innerHTML = `
      <div style="background-color: rgba(255, 255, 255, 0.01); border: 1px dashed hsl(var(--border-color)); padding: 24px; border-radius: 12px; text-align: center;">
        <i data-lucide="loader-2" class="spin" style="margin-right: 8px;"></i>
        Vinculando sua loja Shopee via Edge Function...
      </div>
    `;
    lucide.createIcons();
  }
  
  try {
    const session = (await supabaseClient.auth.getSession()).data.session;
    const token = session ? session.access_token : '';
    
    if (!token) throw new Error("Usuário não autenticado.");
    
    const res = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'auth-shop',
        code: code,
        shop_id: Number(shopId),
        shop_name: shopName
      })
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || `Erro na Edge Function status ${res.status}`);
    }
    
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || "Erro desconhecido na Edge Function");
    }
    
    alert(`Sucesso! A loja "${shopName}" foi vinculada.`);
    selectedShop = shopId;
    const selectShopEl = document.getElementById('select-shop');
    if (selectShopEl) selectShopEl.value = shopId;
    
    await fetchUserShops();
    await loadAllData();
  } catch (err) {
    console.error("Erro ao vincular loja OAuth:", err);
    alert("Falha ao vincular loja Shopee: " + err.message);
  } finally {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function deleteShop(shopId) {
  if (!supabaseClient) return;
  if (!confirm(`Tem certeza que deseja desvincular a loja ${shopId}? Todos os dados desta loja continuarão no banco, mas a integração de sincronização e credenciais serão removidos.`)) {
    return;
  }
  
  try {
    const { error } = await supabaseClient
      .from('shopee_shops')
      .delete()
      .eq('shop_id', Number(shopId));
      
    if (error) throw error;
    
    alert("Loja desvinculada com sucesso!");
    if (String(selectedShop) === String(shopId)) {
      selectedShop = 'all';
      const selectShopEl = document.getElementById('select-shop');
      if (selectShopEl) selectShopEl.value = 'all';
    }
    await fetchUserShops();
    await loadAllData();
  } catch (err) {
    console.error("Erro ao deletar loja:", err);
    alert("Erro ao desvincular loja: " + err.message);
  }
}

async function executeConnectShop() {
  if (!supabaseClient) {
    alert("Configure o Supabase primeiro!");
    return;
  }
  
  const shopNameInput = document.getElementById('new-shop-name').value.trim();
  const shopIdInput = document.getElementById('new-shop-id').value.trim();
  const codeInput = document.getElementById('new-shop-code').value.trim();
  
  const isManual = document.getElementById('manual-tokens-section').style.display === 'block';
  
  if (!shopNameInput) {
    alert("O Nome/Apelido da loja é obrigatório!");
    return;
  }
  
  const executeBtn = document.getElementById('btn-connect-shop-execute');
  const originalText = executeBtn.innerText;
  executeBtn.innerText = "Vinculando...";
  executeBtn.disabled = true;
  
  try {
    const session = (await supabaseClient.auth.getSession()).data.session;
    const token = session ? session.access_token : '';
    if (!token) throw new Error("Usuário não autenticado.");
    
    if (isManual) {
      const accessToken = document.getElementById('new-shop-access').value.trim();
      const refreshToken = document.getElementById('new-shop-refresh').value.trim();
      
      if (!shopIdInput || !accessToken || !refreshToken) {
        throw new Error("Para vinculação manual, preencha o Shop ID, Access Token e Refresh Token.");
      }
      
      const expireTimeIso = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      
      const { error } = await supabaseClient
        .from('shopee_shops')
        .upsert({
          user_id: session.user.id,
          shop_id: Number(shopIdInput),
          shop_name: shopNameInput,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expire_in: expireTimeIso,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,shop_id' });
        
      if (error) throw error;
      
      alert(`Sucesso! A loja "${shopNameInput}" foi cadastrada manualmente.`);
    } else {
      let finalCode = codeInput;
      let finalShopId = shopIdInput;
      
      if (codeInput.includes('?') || codeInput.includes('code=')) {
        try {
          const urlString = codeInput.startsWith('http') ? codeInput : 'https://dummy.com?' + codeInput;
          const urlObj = new URL(urlString);
          const urlCode = urlObj.searchParams.get('code');
          const urlShopId = urlObj.searchParams.get('shop_id');
          if (urlCode) finalCode = urlCode;
          if (urlShopId) finalShopId = urlShopId;
        } catch (e) {
          console.warn("Failed to parse URL query params from input", e);
        }
      }
      
      if (!finalCode) {
        throw new Error("Insira um código de autorização ou a URL de retorno válida.");
      }
      if (!finalShopId) {
        throw new Error("Insira o Shop ID associado a este código.");
      }
      if (!edgeFunctionUrl) {
        throw new Error("A URL da Edge Function não está configurada!");
      }
      
      const res = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'auth-shop',
          code: finalCode,
          shop_id: Number(finalShopId),
          shop_name: shopNameInput
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Erro na Edge Function status ${res.status}`);
      }
      
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Erro na resposta da Edge Function");
      }
      
      alert(`Sucesso! A loja "${shopNameInput}" foi vinculada via OAuth.`);
    }
    
    document.getElementById('new-shop-name').value = '';
    document.getElementById('new-shop-id').value = '';
    document.getElementById('new-shop-code').value = '';
    document.getElementById('new-shop-access').value = '';
    document.getElementById('new-shop-refresh').value = '';
    
    await fetchUserShops();
    await loadAllData();
  } catch (err) {
    console.error("Erro ao vincular loja:", err);
    alert("Falha ao vincular loja: " + err.message);
  } finally {
    executeBtn.innerText = originalText;
    executeBtn.disabled = false;
  }
}

async function openShopeeOAuth(event) {
  if (event) event.preventDefault();
  
  const linkBtn = document.getElementById('btn-generate-oauth');
  const originalText = linkBtn.innerText;
  linkBtn.innerText = "Gerando link...";
  
  try {
    await fetchUserShops();
    if (window.shopeeOauthUrl) {
      window.open(window.shopeeOauthUrl, '_blank');
    } else {
      throw new Error("Não foi possível obter a URL de autorização. Verifique se a URL da Edge Function está correta e se está logado.");
    }
  } catch (err) {
    alert(err.message);
  } finally {
    linkBtn.innerText = originalText;
  }
}

async function filterDataByShop(shopId) {
  selectedShop = shopId;
  const selectShopEl = document.getElementById('select-shop');
  if (selectShopEl) selectShopEl.value = shopId;
  renderMarketplaceScope();
  
  await loadAllData();
}

function toggleManualTokens(event) {
  if (event) event.preventDefault();
  const section = document.getElementById('manual-tokens-section');
  const codeGroup = document.getElementById('oauth-code-group');
  const toggleBtn = document.getElementById('toggle-manual-tokens-btn');
  
  if (section.style.display === 'none') {
    section.style.display = 'block';
    codeGroup.style.display = 'none';
    toggleBtn.innerText = "Ou usar código de autorização / OAuth (recomendado)";
  } else {
    section.style.display = 'none';
    codeGroup.style.display = 'block';
    toggleBtn.innerText = "Ou inserir tokens manuais (avançado)";
  }
}

// Authentication Logic
let isSignUpMode = false;
function toggleAuthMode(event) {
  if (event) event.preventDefault();
  isSignUpMode = !isSignUpMode;
  
  const title = document.getElementById('login-title');
  const subtitle = document.getElementById('login-subtitle');
  const executeBtn = document.getElementById('btn-login-execute');
  const toggleLink = document.getElementById('toggle-signup');
  
  if (isSignUpMode) {
    title.innerText = "Registrar-se";
    subtitle.innerText = "Crie uma nova conta de operador para a sua empresa.";
    executeBtn.innerText = "Criar Minha Conta";
    toggleLink.innerText = "Já tenho uma conta";
  } else {
    title.innerText = "Acessar Central";
    subtitle.innerText = "Insira suas credenciais para gerenciar a operação.";
    executeBtn.innerText = "Entrar no Painel";
    toggleLink.innerText = "Criar uma nova conta";
  }
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const loginBtn = document.getElementById('btn-login-execute');
  
  if (!email || !password) {
    alert("Preencha e-mail e senha!");
    return;
  }
  
  const originalText = loginBtn.innerText;
  loginBtn.innerText = "Acessando...";
  loginBtn.disabled = true;
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    // Success! Show dashboard
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    await loadAllData();
    switchView('dashboard');
  } catch (err) {
    alert("Falha no login: " + err.message);
  } finally {
    loginBtn.innerText = originalText;
    loginBtn.disabled = false;
  }
}

async function handleSignUp() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login-execute');
  
  if (!email || !password) {
    alert("Preencha e-mail e senha!");
    return;
  }
  
  const originalText = btn.innerText;
  btn.innerText = "Criando conta...";
  btn.disabled = true;
  
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });
    
    if (error) throw error;
    
    alert("Cadastro realizado! Tente fazer o login ou verifique seu e-mail para confirmação.");
    isSignUpMode = false;
    toggleAuthMode();
  } catch (err) {
    alert("Erro ao cadastrar: " + err.message);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

function executeAuth() {
  if (isSignUpMode) {
    handleSignUp();
  } else {
    handleLogin();
  }
}

async function fetchSyncHealth() {
  if (!supabaseClient) return;
  const cardsContainer = document.getElementById('sync-health-cards');
  
  try {
    const { data, error } = await supabaseClient.from('vw_sync_health').select('*').limit(1).single();
    if (error) throw error;
    
    if (data) {
      cardsContainer.innerHTML = `
        <div class="metric-card">
          <div class="metric-card-header"><span class="metric-title">Produtos / Variações</span></div>
          <div class="metric-value">${data.total_products || 0} / ${data.total_variations || 0}</div>
        </div>
        <div class="metric-card">
          <div class="metric-card-header"><span class="metric-title">Pedidos Sincronizados</span></div>
          <div class="metric-value">${data.total_orders || 0}</div>
        </div>
        <div class="metric-card">
          <div class="metric-card-header"><span class="metric-title">Repasses Escrow</span></div>
          <div class="metric-value">${data.total_escrow_rows || 0}</div>
        </div>
        <div class="metric-card">
          <div class="metric-card-header"><span class="metric-title">Transações Carteira</span></div>
          <div class="metric-value">${data.total_wallet_transactions || 0}</div>
        </div>
      `;
    }
  } catch (err) {
    console.error("Erro ao ler vw_sync_health", err);
    cardsContainer.innerHTML = `<div class="metric-card"><div class="metric-sub" style="color:red">Erro: ${err.message}</div></div>`;
  }
}

async function fetchSyncLogsAndModules() {
  if (!supabaseClient) return;
  const logsTbody = document.getElementById('sync-logs-tbody');
  const modulesTbody = document.getElementById('sync-modules-tbody');
  
  try {
    const { data: logs, error } = await supabaseClient.from('sync_log').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    
    // Fill logs table
    let logsHtml = '';
    (logs || []).slice(0, 15).forEach(log => {
      let statusColor = log.status === 'SUCCESS' ? 'hsl(var(--color-success))' : log.status === 'ERROR' ? 'hsl(var(--color-danger))' : 'hsl(var(--color-warning))';
      logsHtml += `
        <tr>
          <td>${new Date(log.created_at).toLocaleString('pt-BR')}</td>
          <td><b>${log.module}</b></td>
          <td style="color: ${statusColor}; font-weight: 600;">${log.status}</td>
          <td style="font-size: 0.8rem;">${escapeHTML(log.message)}</td>
        </tr>
      `;
    });
    logsTbody.innerHTML = logsHtml || '<tr><td colspan="4" class="empty-placeholder">Nenhum log encontrado.</td></tr>';
    
    // Derive module status
    const modulesMap = [
      { id: 'products', name: 'Produtos (Anúncios)', action: 'sync-products' },
      { id: 'variations', name: 'Variações de Estoque', action: 'sync-variations' },
      { id: 'orders', name: 'Pedidos (Orders)', action: 'sync-orders-step' },
      { id: 'escrow', name: 'Financeiro (Escrow)', action: 'sync-escrow-step' },
      { id: 'wallet', name: 'Carteira (Wallet)', action: 'sync-wallet-step' },
      { id: 'returns', name: 'Devoluções (Returns)', action: 'sync-returns-step' },
      { id: 'ads_daily', name: 'Performance de Ads', action: 'sync-ads-daily-step' }
    ];
    
    let modulesHtml = '';
    modulesMap.forEach(m => {
      // find latest log for this module
      const latestLog = (logs || []).find(l => l.module === m.id);
      const lastSync = latestLog ? new Date(latestLog.created_at).toLocaleString('pt-BR') : 'Nunca';
      const statusText = latestLog ? latestLog.status : 'N/A';
      const statusColor = statusText === 'SUCCESS' ? 'hsl(var(--color-success))' : statusText === 'ERROR' ? 'hsl(var(--color-danger))' : 'hsl(var(--text-muted))';
      
      modulesHtml += `
        <tr>
          <td><b>${m.name}</b></td>
          <td>${lastSync}</td>
          <td style="color: ${statusColor}; font-weight: 600;">${statusText}</td>
          <td>
            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="triggerShopeeSync('${m.action}', this)">Sincronizar Agora</button>
          </td>
        </tr>
      `;
    });
    modulesTbody.innerHTML = modulesHtml;
    
  } catch (err) {
    console.error("Erro ao buscar logs", err);
  }
}

async function triggerShopeeSync(action, btnElement) {
  if (!edgeFunctionUrl) {
    alert("Salve a URL da Edge Function primeiro!");
    document.getElementById('shopee-edge-url').focus();
    return;
  }
  
  if (!supabaseClient) {
    alert("Supabase não configurado.");
    return;
  }

  let syncShopId = selectedShop;
  if (syncShopId === 'all') {
    if (userShops.length === 0) {
      alert("Nenhuma loja conectada para sincronizar! Adicione uma loja primeiro.");
      return;
    }
    
    const shopOptions = userShops.map((s, idx) => `${idx + 1} - ${s.shop_name} (${s.shop_id})`).join('\n');
    const choice = prompt(`Selecione a loja para sincronizar o módulo:\n\n${shopOptions}\n\nDigite o número correspondente (1 a ${userShops.length}):`);
    if (!choice) return;
    
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= userShops.length) {
      alert("Seleção inválida!");
      return;
    }
    syncShopId = userShops[idx].shop_id;
  }

  const originalText = btnElement.innerText;
  btnElement.innerText = "Sincronizando...";
  btnElement.disabled = true;
  
  try {
    const session = (await supabaseClient.auth.getSession()).data.session;
    const token = session ? session.access_token : '';
    if (!token) {
      throw new Error("Você precisa estar logado para sincronizar.");
    }

    const res = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action,
        shop_id: Number(syncShopId)
      })
    });
    
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro na API (${res.status}): ${errorData}`);
    }
    
    alert(`Ação '${action}' executada com sucesso para a loja ${syncShopId}!`);
    
    // Refresh tables
    setTimeout(fetchSyncHealth, 2000);
    setTimeout(fetchSyncLogsAndModules, 2000);
    
  } catch (err) {
    console.error("Erro ao disparar sync", err);
    alert("Falha ao sincronizar: " + err.message);
  } finally {
    btnElement.innerText = originalText;
    btnElement.disabled = false;
  }
}

// ==========================================
// OTIMIZADOR DE ANÚNCIOS (MODAL)
// ==========================================

async function openProductOptimizer(itemId) {
  console.log("Abrindo otimizador Level 3 para item:", itemId);
  const item = shopeeProductsData.find(p => String(p.item_id) === String(itemId));
  if (!item) {
    console.warn("Item não encontrado nos dados locais:", itemId);
    return;
  }

  // Remove old modal Se o cache segurar o index.html antigo
  let modalEl = document.getElementById('product-modal');
  if (modalEl) modalEl.remove();

  const modalHtml = `
    <div id="product-modal" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <h3 id="pm-title">Nome do Produto</h3>
          <button class="modal-close" onclick="closeProductModal()">FECHAR</button>
        </div>
        
        <div class="modal-tabs">
          <button class="tab-btn active" onclick="switchModalTab('tab-geral', this)">Visão Geral</button>
          <button class="tab-btn" onclick="switchModalTab('tab-media', this)">Mídia & Atributos</button>
          <button class="tab-btn" onclick="switchModalTab('tab-sales', this)">Vendas & Ads</button>
        </div>

        <div class="modal-body">
          <!-- TAB 1: GERAL -->
          <div id="tab-geral" class="tab-content active">
            <div style="display: flex; gap: 20px; margin-bottom: 24px;">
              <img id="pm-image" src="" style="width: 120px; height: 120px; border-radius: 12px; object-fit: cover; border: 1px solid hsl(var(--border-color));">
              <div style="flex: 1;">
                <p style="color: hsl(var(--text-secondary)); font-size: 0.9rem; margin-bottom: 4px;">SKU: <span id="pm-sku" style="color: white; font-weight: 600;">-</span></p>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px;">
                  <div class="metric-card" style="padding: 12px;">
                    <div style="font-size: 0.75rem; color: hsl(var(--text-secondary));">Preço Original</div>
                    <div id="pm-price-orig" style="font-size: 1.1rem; font-weight: 600; text-decoration: line-through; color: hsl(var(--text-muted));">0</div>
                  </div>
                  <div class="metric-card" style="padding: 12px; border-color: rgba(16, 185, 129, 0.3);">
                    <div style="font-size: 0.75rem; color: hsl(var(--text-secondary));">Preço Atual</div>
                    <div id="pm-price-curr" style="font-size: 1.2rem; font-weight: 700; color: #10b981;">0</div>
                  </div>
                  <div class="metric-card" style="padding: 12px;">
                    <div style="font-size: 0.75rem; color: hsl(var(--text-secondary));">Avaliação</div>
                    <div style="font-size: 1.2rem; font-weight: 600; color: #f59e0b;"><span id="pm-rating">0.0</span> <span style="font-size:0.8rem;color:hsl(var(--text-muted))" id="pm-rating-count">(0)</span></div>
                  </div>
                  <div class="metric-card" style="padding: 12px;">
                    <div style="font-size: 0.75rem; color: hsl(var(--text-secondary));">Favoritos</div>
                    <div id="pm-likes" style="font-size: 1.2rem; font-weight: 600; color: #ef4444;">0</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="panel-card">
              <h4 style="margin-bottom: 12px;">Smart Diagnosis (Checklist)</h4>
              <ul id="pm-checklist" style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.9rem; color: hsl(var(--text-secondary));"></ul>
            </div>
          </div>

          <!-- TAB 2: MÍDIA E ATRIBUTOS -->
          <div id="tab-media" class="tab-content">
            <div class="panel-card" style="margin-bottom: 20px;">
              <h4 style="margin-bottom: 12px;">Galeria de Fotos (<span id="pm-photo-count">0</span>)</h4>
              <p style="font-size: 0.8rem; color: hsl(var(--text-secondary));">As resoluções são lidas em tempo real.</p>
              <div id="pm-photos-grid" class="media-grid"></div>
            </div>
            <div class="panel-card" style="margin-bottom: 20px;">
              <h4 style="margin-bottom: 12px;">Vídeo de Demonstração</h4>
              <div id="pm-video-container" style="color: hsl(var(--text-muted)); font-size: 0.9rem;">Sem vídeo cadastrado.</div>
            </div>
            <div class="panel-card">
              <h4 style="margin-bottom: 12px;">Ficha Técnica (Atributos)</h4>
              <div id="pm-attributes-list" class="attr-list"></div>
            </div>
          </div>

          <!-- TAB 3: VENDAS E ADS -->
          <div id="tab-sales" class="tab-content">
             <div class="panel-card" style="margin-bottom: 20px;">
               <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                 <h4>Histórico de Vendas (Orgânico)</h4>
                 <select id="pm-sales-period" onchange="loadModalCharts('${itemId}')" class="select-field" style="width: auto; padding: 6px 10px;">
                   <option value="7">Últimos 7 dias</option>
                   <option value="15">Últimos 15 dias</option>
                   <option value="30" selected>Últimos 30 dias</option>
                 </select>
               </div>
               <div id="pm-chart-sales" style="min-height: 200px; display: flex; align-items: center; justify-content: center; color: hsl(var(--text-muted));">Aguarde...</div>
             </div>
             <div class="panel-card">
              <h4 style="margin-bottom: 12px;">Performance de Ads</h4>
              <div style="display: flex; gap: 16px; margin-bottom: 16px;">
                 <div style="flex: 1; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid hsl(var(--border-color));">
                    <div style="font-size: 0.75rem; color: hsl(var(--text-secondary));">Gasto Total</div>
                    <div id="pm-ads-spent" style="font-size: 1.1rem; font-weight: 600; color: #f59e0b;">R$ 0,00</div>
                 </div>
                 <div style="flex: 1; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid hsl(var(--border-color));">
                    <div style="font-size: 0.75rem; color: hsl(var(--text-secondary));">Receita Gerada</div>
                    <div id="pm-ads-revenue" style="font-size: 1.1rem; font-weight: 600; color: #10b981;">R$ 0,00</div>
                 </div>
                 <div style="flex: 1; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid hsl(var(--border-color));">
                     <div style="font-size: 0.75rem; color: hsl(var(--text-secondary)); display: flex; align-items: center; gap: 4px;">ROAS <i data-lucide="info" style="width: 12px; height: 12px; color: hsl(var(--text-muted)); cursor: help;" title="ROAS Direto (Atribuição de 7 dias para cliques patrocinados via Shopee Ads API)."></i></div>
                    <div id="pm-ads-roas" style="font-size: 1.1rem; font-weight: 600;">0.00</div>
                 </div>
              </div>
              <div id="pm-chart-ads" style="min-height: 200px; display: flex; align-items: center; justify-content: center; color: hsl(var(--text-muted));">Gráfico de Ads...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  const div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild);

  // Preencher Tab 1: Geral
  document.getElementById('pm-title').innerText = item.item_name || 'Sem título';
  document.getElementById('pm-sku').innerText = item.item_sku || 'Sem SKU';
  document.getElementById('pm-image').src = item.image_url || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=120&auto=format&fit=crop&q=60';
  
  document.getElementById('pm-price-orig').innerText = item.original_price ? formatCurrency(item.original_price) : 'Múltiplos Variações';
  document.getElementById('pm-price-curr').innerText = item.current_price ? formatCurrency(item.current_price) : 'Múltiplos Variações';
  document.getElementById('pm-rating').innerText = Number(item.rating_star || 0).toFixed(1);
  document.getElementById('pm-rating-count').innerText = `(${item.rating_count || 0})`;
  document.getElementById('pm-likes').innerText = item.likes || 0;

  const checklistEl = document.getElementById('pm-checklist');
  checklistEl.innerHTML = '';
  function addCheck(text, pass, suggestion) {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.flexDirection = 'column';
    li.style.gap = '4px';
    li.style.paddingBottom = '8px';
    li.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
    li.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <i data-lucide="${pass ? 'check-circle' : 'alert-circle'}" style="width: 16px; height: 16px; color: ${pass ? '#10b981' : '#f59e0b'}"></i>
        <strong style="color: hsl(var(--text-primary))">${text}</strong>
      </div>
      ${!pass && suggestion ? `<div style="padding-left: 24px; font-size: 0.8rem; color: hsl(var(--text-muted));">Sugestão: ${suggestion}</div>` : ''}
    `;
    checklistEl.appendChild(li);
  }

  const views = Number(item.views || 0);
  const sales = Number(item.sales || 0);
  const convRate = views > 0 ? ((sales / views) * 100).toFixed(1) : 0;
  
  addCheck(`Taxa de Conversão: ${convRate}% (${sales} vendas / ${views} visitas)`, convRate >= 1.5, 'Se a conversão está baixa (< 1.5%), o problema não é tráfego, é a oferta. Baixe o preço ou melhore a foto principal.');
  const discount = Number(item.discount_percent || 0);
  addCheck(`Desconto Aplicado: ${discount}%`, discount > 0, 'Anúncios sem preço cortado (de/por) perdem destaque nas buscas da Shopee.');
  const likes = Number(item.likes || 0);
  addCheck(`Favoritados: ${likes}`, likes >= 10 && sales < 5 ? false : true, `Você tem ${likes} pessoas que favoritaram mas não compraram. Envie um cupom via chat para esses clientes!`);

  // Preencher Tab 2: Mídia
  const imagesJson = item.images_json;
  const photoGrid = document.getElementById('pm-photos-grid');
  photoGrid.innerHTML = '';
  if (imagesJson && Array.isArray(imagesJson)) {
    document.getElementById('pm-photo-count').innerText = imagesJson.length;
    imagesJson.forEach(url => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'media-item';
      itemDiv.innerHTML = `
        <img src="${url}">
        <div class="media-info">Medindo...</div>
      `;
      photoGrid.appendChild(itemDiv);
      const img = new Image();
      img.onload = function() {
        const infoDiv = itemDiv.querySelector('.media-info');
        infoDiv.innerText = `${this.naturalWidth}x${this.naturalHeight}px`;
        if (this.naturalWidth < 800) { infoDiv.style.color = '#ef4444'; infoDiv.innerText += ' (Baixa)'; }
      };
      img.src = url;
    });
  } else {
    photoGrid.innerHTML = '<div style="grid-column: 1/-1; color: hsl(var(--text-muted))">Sincronize os produtos novamente para buscar as fotos.</div>';
  }

  const videoInfo = item.video_info_json;
  const videoContainer = document.getElementById('pm-video-container');
  if (videoInfo && Array.isArray(videoInfo) && videoInfo.length > 0 && videoInfo[0].video_url) {
    videoContainer.innerHTML = `
      <video src="${videoInfo[0].video_url}" controls style="width: 100%; max-height: 250px; border-radius: 8px; border: 1px solid hsl(var(--border-color));"></video>
      <div id="pm-video-meta" style="margin-top: 8px; font-weight: 600;">Lendo duração...</div>
    `;
    const vidObj = document.createElement('video');
    vidObj.onloadedmetadata = function() {
      document.getElementById('pm-video-meta').innerText = `Duração: ${Math.round(vidObj.duration)}s | Resolução: ${vidObj.videoWidth}x${vidObj.videoHeight}px`;
    };
    vidObj.src = videoInfo[0].video_url;
  }

  const attrs = item.attributes_json;
  const attrList = document.getElementById('pm-attributes-list');
  attrList.innerHTML = '';
  if (attrs && Array.isArray(attrs) && attrs.length > 0) {
    attrs.forEach(attr => {
      const val = attr.attribute_value_list && attr.attribute_value_list.length > 0 ? attr.attribute_value_list[0].display_value_name : 'N/A';
      attrList.innerHTML += `
        <div class="attr-item">
          <span style="color: hsl(var(--text-secondary)); font-size: 0.8rem;">${attr.display_attribute_name}</span>
          <span style="font-weight: 600; font-size: 0.85rem;">${val}</span>
        </div>
      `;
    });
  } else {
    attrList.innerHTML = '<div style="grid-column: 1/-1; color: hsl(var(--text-muted))">Nenhum atributo ou pendente de sincronização.</div>';
  }

  document.getElementById('product-modal').style.display = 'flex';
  lucide.createIcons();
  loadModalCharts(itemId);
}

function switchModalTab(tabId, btnElement) {
  const btns = btnElement.parentElement.querySelectorAll('.tab-btn');
  btns.forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');

  const contents = document.getElementById('product-modal').querySelectorAll('.tab-content');
  contents.forEach(c => c.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

let pmSalesChartInstance = null;
let pmAdsChartInstance = null;

async function loadModalCharts(itemId) {
  const period = parseInt(document.getElementById('pm-sales-period').value || 30);
  const chartSalesEl = document.getElementById('pm-chart-sales');
  chartSalesEl.innerHTML = 'Carregando histórico...';
  if (!supabaseClient) return;

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - period);
    const startIso = start.toISOString();
    
    // Fetch Sales
    // 1. Fetch Order Items for this Product
    const { data: orderItems, error: oiError } = await supabaseClient
      .from('shopee_order_items')
      .select('order_sn, quantity, unit_price')
      .eq('item_id', itemId);
      
    // 2. Fetch Orders for dates
    let ordersData = [];
    if (orderItems && orderItems.length > 0) {
      const orderSns = [...new Set(orderItems.map(oi => oi.order_sn))];
      // Chunking if too many
      const { data: orders, error: oError } = await supabaseClient
        .from('shopee_orders')
        .select('order_sn, created_at')
        .in('order_sn', orderSns.slice(0, 500)) // safe limit
        .gte('created_at', startIso);
      if (orders) ordersData = orders;
    }

    const salesMap = {};
    for (let i = 0; i < period; i++) {
      const d = new Date(); d.setDate(end.getDate() - i);
      salesMap[d.toISOString().split('T')[0]] = { qty: 0 };
    }

    // Map order_sn to date
    const orderDateMap = {};
    ordersData.forEach(o => {
      if (o.created_at) {
        orderDateMap[o.order_sn] = o.created_at.split('T')[0];
      }
    });

    if (orderItems) {
      orderItems.forEach(oi => {
        const dateStr = orderDateMap[oi.order_sn];
        if (dateStr && salesMap[dateStr]) {
          salesMap[dateStr].qty += Number(oi.quantity || 1);
        }
      });
    }

    const sortedDates = Object.keys(salesMap).sort();
    const qtyData = sortedDates.map(d => salesMap[d].qty);
    const categories = sortedDates.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });

    chartSalesEl.innerHTML = '';
    if (pmSalesChartInstance) pmSalesChartInstance.destroy();

    const salesOptions = {
      series: [{ name: 'Qtd Vendida', type: 'column', data: qtyData }],
      chart: { height: 250, type: 'bar', toolbar: { show: false }, background: 'transparent' },
      colors: ['#8a4bfa'],
      theme: { mode: 'dark' },
      xaxis: { categories: categories }
    };
    pmSalesChartInstance = new ApexCharts(chartSalesEl, salesOptions);
    pmSalesChartInstance.render();

    // Fetch Ads
    const { data: adsData, error: aError } = await supabaseClient
      .from('shopee_ads_daily')
      .select('date, expense, direct_gmv')
      .eq('item_id', itemId)
      .gte('date', startIso);
      
    if (!aError && adsData) {
      const totalExpense = adsData.reduce((acc, curr) => acc + Number(curr.expense || 0), 0);
      const totalRevenue = adsData.reduce((acc, curr) => acc + Number(curr.direct_gmv || 0), 0);
      const roas = totalExpense > 0 ? (totalRevenue / totalExpense).toFixed(2) : '0.00';

      document.getElementById('pm-ads-spent').innerText = formatCurrency(totalExpense);
      document.getElementById('pm-ads-revenue').innerText = formatCurrency(totalRevenue);
      document.getElementById('pm-ads-roas').innerText = roas;
      
      const adsMap = {};
      sortedDates.forEach(d => adsMap[d] = { expense: 0, revenue: 0 });
      adsData.forEach(ad => {
        if (ad.date) {
          const dStr = ad.date.split('T')[0];
          if (adsMap[dStr]) {
            adsMap[dStr].expense += Number(ad.expense || 0);
            adsMap[dStr].revenue += Number(ad.direct_gmv || 0);
          }
        }
      });
      
      const expData = sortedDates.map(d => adsMap[d].expense);
      const revData = sortedDates.map(d => adsMap[d].revenue);
      
      const chartAdsEl = document.getElementById('pm-chart-ads');
      chartAdsEl.innerHTML = '';
      if (pmAdsChartInstance) pmAdsChartInstance.destroy();
      
      const adsOptions = {
        series: [{ name: 'Gasto Ads', type: 'area', data: expData }, { name: 'Receita Ads', type: 'area', data: revData }],
        chart: { height: 250, type: 'area', toolbar: { show: false }, background: 'transparent' },
        colors: ['#ef4444', '#10b981'],
        theme: { mode: 'dark' },
        xaxis: { categories: categories }
      };
      pmAdsChartInstance = new ApexCharts(chartAdsEl, adsOptions);
      pmAdsChartInstance.render();
    }
  } catch (e) {
    chartSalesEl.innerHTML = 'Erro ao carregar gráficos.';
  }
}

function closeProductModal() {
  document.getElementById('product-modal').style.display = 'none';
}


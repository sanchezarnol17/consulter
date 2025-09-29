// ===== Pega aquí tu URL /exec =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxxL7Sau_wC4Vg5-DLzK0y41EjlR6S1hgWEywnLIbUCSKlAoKJQY5doeAchSElQWulpcg/exec';

// ===== Helper UI =====
const $ = s => document.querySelector(s);
const netState = $('#netState');
const showNet = m => netState.textContent = m || '';

// ===== Polyfill simple para <dialog> si el navegador no soporta showModal =====
document.addEventListener('DOMContentLoaded', () => {
  const dlg = $('#patientDialog');
  if (!dlg.showModal) {
    dlg.showModal = () => dlg.setAttribute('open', '');
    dlg.close = () => dlg.removeAttribute('open');
  }
});

// ===== Peticiones (sin headers para evitar preflight CORS) =====
async function apiGet(params){
  const url = new URL(API_URL);
  Object.entries(params||{}).forEach(([k,v])=> url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return []; }
}
async function apiPost(body){
  const res = await fetch(API_URL, { method:'POST', body: JSON.stringify(body) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { ok:true, raw: txt }; }
}

// ===== Estado =====
let state = { patients: [], query: '' };

// ===== Inicio seguro cuando el DOM está listo =====
document.addEventListener('DOMContentLoaded', () => {
  const listEl = $('#list');
  const detailEl = $('#detail');
  const searchEl = $('#search');
  const dlg = $('#patientDialog');
  const form = $('#patientForm');

  $('#btnAdd').addEventListener('click', () => openForm());
  $('#btnReload').addEventListener('click', () => loadPatients());
  $('#btnClear').addEventListener('click', () => { searchEl.value=''; state.query=''; renderList(); });
  $('#btnCancel').addEventListener('click', () => dlg.close());
  searchEl.addEventListener('input', () => { state.query = searchEl.value; renderList(); });

  function humanDate(d){ return d ? new Date(d).toISOString().slice(0,10) : '—'; }

  function renderList(){
    detailEl.classList.add('hidden');
    listEl.innerHTML = '';
    const q = (state.query||'').toLowerCase();
    const rows = state.patients.filter(p=>(`${p.nombre||''} ${p.documento||''} ${p.telefono||''}`).toLowerCase().includes(q));
    if(!rows.length){ listEl.innerHTML = '<div class="text-gray-500">No hay pacientes.</div>'; return; }
    rows.forEach(p => {
      const div = document.createElement('div');
      div.className = 'bg-white rounded-2xl shadow p-4 flex items-center justify-between';
      div.innerHTML = `
        <div>
          <button class="text-lg font-semibold hover:underline" data-open="${p.id}">${p.nombre}</button>
          <div class="text-sm text-gray-500">Doc: ${p.documento||'—'} · Tel: ${p.telefono||'—'} · Reg: ${humanDate(p.fecha_creacion)}</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600" data-edit="${p.id}">Editar</button>
          <button class="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700" data-del="${p.id}">Eliminar</button>
        </div>`;
      listEl.appendChild(div);
    });
    listEl.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', () => openDetail(b.dataset.open)));
    listEl.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', () => openForm(b.dataset.edit)));
    listEl.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', () => deletePatient(b.dataset.del)));
  }

  function openForm(id){
    form.reset();
    $('#dialogTitle').textContent = id ? 'Editar paciente' : 'Nuevo paciente';
    $('#p_id').value = id || '';
    if(id){
      const p = state.patients.find(x=> x.id === id);
      if(p){
        $('#p_full_name').value = p.nombre||'';
        $('#p_document_id').value = p.documento||'';
        $('#p_phone').value = p.telefono||'';
        $('#p_email').value = p.email||'';
        $('#p_birthdate').value = p.fecha_nacimiento||'';
        $('#p_address').value = p.direccion||'';
        $('#p_notes').value = p.notas||'';
      }
    }
    dlg.showModal();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const id = $('#p_id').value || ('p_' + Date.now().toString(36));
    const payload = {
      action: 'upsert_patient',
      data: {
        id,
        nombre: $('#p_full_name').value.trim(),
        documento: $('#p_document_id').value.trim(),
        telefono: $('#p_phone').value.trim(),
        email: $('#p_email').value.trim(),
        fecha_nacimiento: $('#p_birthdate').value || '',
        direccion: $('#p_address').value.trim(),
        notas: $('#p_notes').value.trim()
      }
    };
    if(!payload.data.nombre){ alert('El nombre es obligatorio.'); return; }
    try{
      showNet('Guardando...');
      await apiPost(payload);
      dlg.close();
      await loadPatients();
      showNet('Guardado ✓'); setTimeout(()=> showNet(''), 1500);
    }catch(e){ alert('Error guardando: '+e.message); showNet('Error'); }
  });

  async function deletePatient(id){
    const p = state.patients.find(x=> x.id === id);
    if(!p) return; if(!confirm(`¿Eliminar a "${p.nombre}"?`)) return;
    try{
      showNet('Eliminando...');
      await apiPost({ action:'delete_patient', data:{ id } });
      await loadPatients();
      showNet('Eliminado ✓'); setTimeout(()=> showNet(''), 1500);
    }catch(e){ alert('Error: '+e.message); }
  }

  async function openDetail(id){
    const p = state.patients.find(x=> x.id === id);
    if(!p) return;
    detailEl.classList.remove('hidden');
    detailEl.innerHTML = `
      <div class="bg-white rounded-2xl shadow p-6 mb-4">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-2xl font-bold">${p.nombre}</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm">
              <div><span class="text-gray-500">Documento:</span> ${p.documento||'—'}</div>
              <div><span class="text-gray-500">Teléfono:</span> ${p.telefono||'—'}</div>
              <div><span class="text-gray-500">Email:</span> ${p.email||'—'}</div>
              <div><span class="text-gray-500">Fecha nac.:</span> ${humanDate(p.fecha_nacimiento)}</div>
              <div class="md:col-span-2"><span class="text-gray-500">Dirección:</span> ${p.direccion||'—'}</div>
              <div class="md:col-span-2"><span class="text-gray-500">Notas:</span> ${p.notas||'—'}</div>
            </div>
          </div>
          <div class="space-x-2">
            <button class="px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600" data-edit="${p.id}">Editar</button>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl shadow p-6">
        <h3 class="text-xl font-semibold mb-3">Historial clínico</h3>
        <form id="histForm" class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input type="date" id="h_date" class="px-3 py-2 rounded-xl border" value="${new Date().toISOString().slice(0,10)}" />
          <input id="h_summary" class="md:col-span-2 px-3 py-2 rounded-xl border" placeholder="Resumen (Motivo/Diagnóstico/Procedimiento)" />
          <textarea id="h_details" rows="3" class="md:col-span-3 px-3 py-2 rounded-xl border" placeholder="Detalles/Observaciones"></textarea>
          <div class="md:col-span-3">
            <button class="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700">Añadir</button>
          </div>
        </form>
        <div id="historyList" class="grid gap-3"></div>
      </div>`;

    detailEl.querySelector('[data-edit]').addEventListener('click', () => openForm(p.id));

    const histForm = document.getElementById('histForm');
    const hList = document.getElementById('historyList');

    function renderHistory(items){
      const rows = (items||[]).slice().sort((a,b)=> String(b.fecha||'').localeCompare(String(a.fecha||'')));
      hList.innerHTML = rows.length ? '' : '<div class="text-gray-500">Aún no hay registros.</div>';
      for(const h of rows){
        const art = document.createElement('article');
        art.className = 'bg-gray-50 rounded-2xl p-4 border';
        art.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="font-medium">${humanDate(h.fecha)} — ${h.resumen||''}</div>
            <button class="text-red-600 hover:underline" data-del-h="${h.id}">Eliminar</button>
          </div>
          ${h.detalles ? `<p class="text-sm text-gray-700 mt-1 whitespace-pre-line">${h.detalles}</p>` : ''}`;
        hList.appendChild(art);
      }
      hList.querySelectorAll('[data-del-h]').forEach(btn=> btn.addEventListener('click', async () => {
        if(!confirm('¿Eliminar esta entrada del historial?')) return;
        try{
          showNet('Eliminando historial...');
          await apiPost({ action:'delete_history', data:{ id: btn.dataset.delH, patient_id: p.id } });
          await loadHistory();
          showNet('Eliminado ✓'); setTimeout(()=> showNet(''), 1500);
        }catch(e){ alert('Error eliminando historial: '+e.message); }
      }));
    }

    async function loadHistory(){
      try{
        showNet('Cargando historial...');
        const data = await apiGet({ mode:'histories', patient_id: p.id });
        renderHistory(data);
        showNet('');
      } catch(e){
        hList.innerHTML = `<div class='text-red-700 bg-red-50 border border-red-200 rounded-xl p-3'>No se pudo cargar el historial. <br><small>${e.message}</small></div>`;
        showNet('Error');
      }
    }

    histForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const summary = document.getElementById('h_summary').value.trim();
      if(!summary){ alert('El resumen es obligatorio.'); return; }
      try{
        showNet('Guardando historial...');
        await apiPost({ action:'add_history', data:{
          id: 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
          patient_id: p.id,
          fecha: document.getElementById('h_date').value || new Date().toISOString().slice(0,10),
          resumen: summary,
          detalles: document.getElementById('h_details').value.trim()
        }});
        histForm.reset();
        document.getElementById('h_date').value = new Date().toISOString().slice(0,10);
        await loadHistory();
        showNet('Historial guardado ✓'); setTimeout(()=> showNet(''), 1500);
      }catch(err){ alert('Error guardando historial: '+err.message); showNet('Error'); }
    });

    await loadHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadPatients(){
    try{
      showNet('Cargando...');
      const data = await apiGet({ mode:'patients' });
      state.patients = Array.isArray(data)?data:[];
      renderList();
      showNet('');
    } catch(e){
      const listEl = $('#list');
      listEl.innerHTML = `<div class='text-red-700 bg-red-50 border border-red-200 rounded-xl p-3'>No se pudo cargar desde Google Sheets. Revisa la URL del script y permisos. <br><small>${e.message}</small></div>`;
      showNet('Error');
    }
  }

  // Primer load
  loadPatients();
});
/* ============ MÓDULO FINANZAS (NUEVO) ============ */
document.addEventListener('DOMContentLoaded', () => {
  // Estado en navegador
  const LS_KEY = 'finance_v1';
  const finance = {
    categories: [],   // [{ id, name }]
    txs: [],          // [{ id, date, type: 'ingreso'|'gasto', categoryId, desc, amount }]
    assets: []        // [{ id, name, value }]
  };

  // Atajos locales (no tocan los tuyos)
  const $ = s => document.querySelector(s);
  const finUuid = (p='id_') => p + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(3);
  const finMoney = n => (Number(n||0)).toLocaleString('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 });

  // Elementos
  const finIncome = $('#fin_income');
  const finExpense = $('#fin_expense');
  const finNet = $('#fin_net');
  const finAssetsTotal = $('#fin_assets_total');

  const filterType = $('#fin_filter_type');
  const filterCat = $('#fin_filter_cat');
  const filterText = $('#fin_filter_text');
  const btnFilterClear = $('#fin_btn_clear');

  const selType = $('#fin_type');
  const selCat = $('#fin_category');
  const inpDate = $('#fin_date');
  const inpAmount = $('#fin_amount');
  const inpDesc = $('#fin_desc');
  const btnAdd = $('#fin_add');

  const inpNewCat = $('#fin_new_cat');
  const btnAddCat = $('#fin_add_cat');
  const catList = $('#fin_cat_list');

  const finTable = $('#fin_table');
  const btnExportCsv = $('#fin_export_csv');

  const assetName = $('#asset_name');
  const assetValue = $('#asset_value');
  const assetAdd = $('#asset_add');
  const assetTable = $('#asset_table');

  // Persistencia local
  function saveLocal(){
    localStorage.setItem(LS_KEY, JSON.stringify(finance));
  }
  function loadLocal(){
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      try{
        const obj = JSON.parse(raw);
        finance.categories = obj.categories || [];
        finance.txs = obj.txs || [];
        finance.assets = obj.assets || [];
      }catch{}
    } else {
      // Categorías base
      finance.categories = [
        { id: finUuid('cat_'), name: 'Consulta' },
        { id: finUuid('cat_'), name: 'Medicamentos' },
        { id: finUuid('cat_'), name: 'Equipos' },
      ];
      saveLocal();
    }
  }

  // Utilidades
  function setToday(){ inpDate.value = new Date().toISOString().slice(0,10); }
  function renderCategoryOptions(){
    const opts = ['<option value="">(sin categoría)</option>']
      .concat(finance.categories.map(c=> `<option value="${c.id}">${c.name}</option>`));
    selCat.innerHTML = opts.join('');
    filterCat.innerHTML = ['<option value="">Categoría (todas)</option>']
      .concat(finance.categories.map(c=> `<option value="${c.id}">${c.name}</option>`)).join('');
  }
  function renderCategoriesChips(){
    catList.innerHTML = '';
    finance.categories.forEach(c=>{
      const span = document.createElement('span');
      span.className = 'px-3 py-1 rounded-full bg-gray-100 border flex items-center gap-2';
      span.innerHTML = `<span>${c.name}</span><button data-del-cat="${c.id}" class="text-red-600 hover:underline">Eliminar</button>`;
      catList.appendChild(span);
    });
    catList.querySelectorAll('[data-del-cat]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.dataset.delCat;
        if(!confirm('Eliminar categoría? (Los movimientos conservarán el id)')) return;
        finance.categories = finance.categories.filter(x=> x.id!==id);
        saveLocal();
        renderCategoryOptions();
        renderCategoriesChips();
        renderFinanceTables();
      });
    });
  }
  function totals(){
    const inc = finance.txs.filter(t=>t.type==='ingreso').reduce((s,t)=> s+Number(t.amount||0), 0);
    const exp = finance.txs.filter(t=>t.type==='gasto').reduce((s,t)=> s+Number(t.amount||0), 0);
    const assetsSum = finance.assets.reduce((s,a)=> s+Number(a.value||0), 0);
    return { inc, exp, net: inc-exp, assetsSum };
  }
  function renderSummary(){
    const t = totals();
    finIncome.textContent = finMoney(t.inc);
    finExpense.textContent = finMoney(t.exp);
    finNet.textContent = finMoney(t.net);
    finAssetsTotal.textContent = finMoney(t.assetsSum);
  }
  function renderFinanceTables(){
    // Movimientos (con filtros)
    const txt = (filterText.value||'').toLowerCase();
    const rows = finance.txs.filter(t=>{
      const okType = !filterType.value || t.type===filterType.value;
      const okCat = !filterCat.value || t.categoryId===filterCat.value;
      const okTxt = !txt || (t.desc||'').toLowerCase().includes(txt);
      return okType && okCat && okTxt;
    }).sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')));

    finTable.innerHTML = '';
    rows.forEach(t=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2 pr-4">${t.date||'—'}</td>
        <td class="py-2 pr-4 capitalize">${t.type}</td>
        <td class="py-2 pr-4">${(finance.categories.find(c=>c.id===t.categoryId)||{}).name||'—'}</td>
        <td class="py-2 pr-4">${t.desc||''}</td>
        <td class="py-2 pr-4 text-right">${finMoney(t.amount)}</td>
        <td class="py-2"><button class="text-red-600 hover:underline" data-del-tx="${t.id}">Eliminar</button></td>`;
      finTable.appendChild(tr);
    });
    finTable.querySelectorAll('[data-del-tx]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.dataset.delTx;
        if(!confirm('¿Eliminar este movimiento?')) return;
        finance.txs = finance.txs.filter(x=> x.id!==id);
        saveLocal();
        renderSummary();
        renderFinanceTables();
      });
    });

    // Activos
    assetTable.innerHTML = '';
    finance.assets.slice().sort((a,b)=> a.name.localeCompare(b.name)).forEach(a=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2 pr-4">${a.name}</td>
        <td class="py-2 pr-4 text-right">${finMoney(a.value)}</td>
        <td class="py-2"><button class="text-red-600 hover:underline" data-del-asset="${a.id}">Eliminar</button></td>`;
      assetTable.appendChild(tr);
    });
    assetTable.querySelectorAll('[data-del-asset]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.dataset.delAsset;
        if(!confirm('¿Eliminar este activo?')) return;
        finance.assets = finance.assets.filter(x=> x.id!==id);
        saveLocal();
        renderSummary();
        renderFinanceTables();
      });
    });
  }

  // CSV
  function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = headers.map(esc).join(',');
    const body = rows.map(r => headers.map(h => esc(r[h])).join(',')).join('\n');
    return head + '\n' + body;
  }
  function download(filename, text) {
    const blob = new Blob([text], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // Eventos
  btnAddCat.addEventListener('click', ()=>{
    const name = (inpNewCat.value||'').trim();
    if(!name) return alert('Escribe un nombre de categoría.');
    if(finance.categories.some(c=> c.name.toLowerCase()===name.toLowerCase())){
      return alert('Esa categoría ya existe.');
    }
    finance.categories.push({ id: finUuid('cat_'), name });
    inpNewCat.value = '';
    saveLocal();
    renderCategoryOptions();
    renderCategoriesChips();
  });

  btnAdd.addEventListener('click', ()=>{
    const type = selType.value;
    const date = inpDate.value || new Date().toISOString().slice(0,10);
    const categoryId = selCat.value || '';
    const amount = Number(inpAmount.value||0);
    const desc = (inpDesc.value||'').trim();
    if(!amount || amount<=0) return alert('Ingresa un valor mayor a 0.');
    finance.txs.push({ id: finUuid('tx_'), type, date, categoryId, amount, desc });
    inpAmount.value = ''; inpDesc.value='';
    saveLocal();
    renderSummary();
    renderFinanceTables();
  });

  [filterType, filterCat, filterText].forEach(el=>{
    el.addEventListener('input', renderFinanceTables);
  });

  btnFilterClear.addEventListener('click', ()=>{
    filterType.value = ''; filterCat.value=''; filterText.value='';
    renderFinanceTables();
  });

  assetAdd.addEventListener('click', ()=>{
    const name = (assetName.value||'').trim();
    const value = Number(assetValue.value||0);
    if(!name) return alert('Escribe el nombre del activo.');
    if(!value || value<=0) return alert('Ingresa un valor del activo.');
    finance.assets.push({ id: finUuid('as_'), name, value });
    assetName.value=''; assetValue.value='';
    saveLocal();
    renderSummary();
    renderFinanceTables();
  });

  btnExportCsv.addEventListener('click', ()=>{
    if(!finance.txs.length) return alert('No hay movimientos.');
    const rows = finance.txs.map(t=>({
      id: t.id, fecha: t.date, tipo: t.type,
      categoria: (finance.categories.find(c=>c.id===t.categoryId)||{}).name||'',
      descripcion: t.desc||'',
      valor: t.amount
    }));
    const csv = toCSV(rows);
    download('movimientos.csv', csv);
  });

  // Inicialización
  setToday();
  loadLocal();
  renderCategoryOptions();
  renderCategoriesChips();
  renderSummary();
  renderFinanceTables();
});
/* ========== FIN MÓDULO FINANZAS (NUEVO) ========== */
/* ====== Tabs Pacientes / Finanzas ====== */
document.addEventListener('DOMContentLoaded', () => {
  const tabPac = document.getElementById('tabPacientes');
  const tabFin = document.getElementById('tabFinanzas');
  const modPac = document.getElementById('modulePatients');
  const modFin = document.getElementById('moduleFinance');

  // Botones del header de Pacientes (para ocultarlos en Finanzas)
  const btnAdd = document.getElementById('btnAdd');
  const btnReload = document.getElementById('btnReload');

  function setActive(pacientes){
    if (!modPac || !modFin) return;

    // Mostrar/ocultar módulos
    modPac.classList.toggle('hidden', !pacientes);
    modFin.classList.toggle('hidden', pacientes);

    // Estilo de la pestaña activa
    tabPac.classList.toggle('bg-gray-900', pacientes);
    tabPac.classList.toggle('text-white', pacientes);
    tabPac.classList.toggle('bg-gray-200', !pacientes);

    tabFin.classList.toggle('bg-gray-900', !pacientes);
    tabFin.classList.toggle('text-white', !pacientes);
    tabFin.classList.toggle('bg-gray-200', pacientes);

    // Ocultar botones de Pacientes cuando estás en Finanzas
    btnAdd?.classList.toggle('hidden', !pacientes);
    btnReload?.classList.toggle('hidden', !pacientes);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tabPac?.addEventListener('click', () => setActive(true));
  tabFin?.addEventListener('click', () => setActive(false));

  // Arranca mostrando Pacientes
  setActive(true);
});
/* ==== Fin Tabs ===== */



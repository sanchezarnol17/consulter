// ===== URL /exec (Apps Script) =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxxL7Sau_wC4Vg5-DLzK0y41EjlR6S1hgWEywnLIbUCSKlAoKJQY5doeAchSElQWulpcg/exec';

// ===== Helpers base =====
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const netState = $('#netState');
const showNet = m => { if (netState) netState.textContent = m || ''; };

const humanDate = d => (d ? new Date(d).toISOString().slice(0,10) : '—');
const money = n => (Number(n||0)).toLocaleString('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 });
const uuid = (p='id_') => p + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(3);

async function apiGet(params){
  const url = new URL(API_URL);
  Object.entries(params||{}).forEach(([k,v])=> url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const txt = await res.text();
  if(!res.ok) throw new Error(txt || ('HTTP '+res.status));
  try { return JSON.parse(txt); } catch { return []; }
}
async function apiPost(body){
  const res = await fetch(API_URL, { method:'POST', body: JSON.stringify(body) });
  const txt = await res.text();
  if(!res.ok) throw new Error(txt || ('HTTP '+res.status));
  try { return JSON.parse(txt); } catch { return { ok:true, raw: txt }; }
}

// CSV helpers compartidos
function toCSV(rows){
  if(!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = headers.map(esc).join(',');
  const body = rows.map(r => headers.map(h => esc(r[h])).join(',')).join('\n');
  return head + '\n' + body;
}
function download(filename, text){
  const blob = new Blob([text], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ===== Estado global Pacientes =====
let state = { patients: [], query: '' };

document.addEventListener('DOMContentLoaded', () => {
  // -------- Polyfill <dialog> --------
  const dlg = $('#patientDialog');
  if (dlg && !dlg.showModal) {
    dlg.showModal = () => dlg.setAttribute('open', '');
    dlg.close     = () => dlg.removeAttribute('open');
  }

  // ================== PACIENTES ==================
  (function initPatients(){
    const listEl   = $('#list');
    const detailEl = $('#detail');
    const searchEl = $('#search');
    const form     = $('#patientForm');
    if (!listEl || !detailEl || !searchEl || !form) return; // por si no existe este módulo

    $('#btnAdd')?.addEventListener('click', () => openForm());
    $('#btnReload')?.addEventListener('click', () => loadPatients());
    $('#btnClear')?.addEventListener('click', () => { searchEl.value=''; state.query=''; renderList(); });
    $('#btnCancel')?.addEventListener('click', () => dlg?.close());
    searchEl.addEventListener('input', () => { state.query = searchEl.value; renderList(); });

    function renderList(){
      detailEl.classList.add('hidden');
      listEl.innerHTML = '';
      const q = (state.query||'').toLowerCase();
      const rows = state.patients.filter(p => (`${p.nombre||''} ${p.documento||''} ${p.telefono||''}`).toLowerCase().includes(q));
      if(!rows.length){
        listEl.innerHTML = '<div class="text-gray-500">No hay pacientes.</div>';
        return;
      }
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
      // Delegación de eventos
      $$('[data-open]', listEl).forEach(b => b.addEventListener('click', () => openDetail(b.dataset.open)));
      $$('[data-edit]', listEl).forEach(b => b.addEventListener('click', () => openForm(b.dataset.edit)));
      $$('[data-del]',  listEl).forEach(b => b.addEventListener('click', () => deletePatient(b.dataset.del)));
    }

    function openForm(id){
  form.reset();

  const titleEl = $('#dialogTitle');
  if (titleEl) titleEl.textContent = id ? 'Editar paciente' : 'Nuevo paciente';

  const idEl = $('#p_id');
  if (idEl) idEl.value = id || '';

  if (id){
    const p = state.patients.find(x => x.id === id);
    if (p){
      const set = (sel, val='') => {
        const el = $(sel);
        if (el) el.value = val;
      };
      set('#p_full_name',   p.nombre);
      set('#p_document_id', p.documento);
      set('#p_phone',       p.telefono);
      set('#p_email',       p.email);
      set('#p_birthdate',   p.fecha_nacimiento);
      set('#p_address',     p.direccion);
      set('#p_notes',       p.notas);
    }
  }

  if (dlg && dlg.showModal) dlg.showModal();
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
        dlg?.close();
        await loadPatients();
        showNet('Guardado ✓'); setTimeout(()=> showNet(''), 1500);
      }catch(e){ alert('Error guardando: '+(e?.message||e)); showNet('Error'); }
    });

    async function deletePatient(id){
      const p = state.patients.find(x=> x.id === id);
      if(!p) return;
      if(!confirm(`¿Eliminar a "${p.nombre}"?`)) return;
      try{
        showNet('Eliminando...');
        await apiPost({ action:'delete_patient', data:{ id } });
        await loadPatients();
        showNet('Eliminado ✓'); setTimeout(()=> showNet(''), 1500);
      }catch(e){ alert('Error: '+(e?.message||e)); }
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

      detailEl.querySelector('[data-edit]')?.addEventListener('click', () => openForm(p.id));

      const histForm = $('#histForm');
      const hList    = $('#historyList');

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
        $$('[data-del-h]', hList).forEach(btn => btn.addEventListener('click', async () => {
          if(!confirm('¿Eliminar esta entrada del historial?')) return;
          try{
            showNet('Eliminando historial...');
            await apiPost({ action:'delete_history', data:{ id: btn.dataset.delH, patient_id: p.id } });
            await loadHistory();
            showNet('Eliminado ✓'); setTimeout(()=> showNet(''), 1500);
          }catch(e){ alert('Error eliminando historial: '+(e?.message||e)); }
        }));
      }

      async function loadHistory(){
        try{
          showNet('Cargando historial...');
          const data = await apiGet({ mode:'histories', patient_id: p.id });
          renderHistory(data);
          showNet('');
        }catch(e){
          hList.innerHTML = `<div class='text-red-700 bg-red-50 border border-red-200 rounded-xl p-3'>No se pudo cargar el historial. <br><small>${e?.message||e}</small></div>`;
          showNet('Error');
        }
      }

      histForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const summary = $('#h_summary').value.trim();
        if(!summary){ alert('El resumen es obligatorio.'); return; }
        try{
          showNet('Guardando historial...');
          await apiPost({ action:'add_history', data:{
            id: 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
            patient_id: p.id,
            fecha: $('#h_date').value || new Date().toISOString().slice(0,10),
            resumen: summary,
            detalles: $('#h_details').value.trim()
          }});
          histForm.reset();
          $('#h_date').value = new Date().toISOString().slice(0,10);
          await loadHistory();
          showNet('Historial guardado ✓'); setTimeout(()=> showNet(''), 1500);
        }catch(err){ alert('Error guardando historial: '+(err?.message||err)); showNet('Error'); }
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
        listEl.innerHTML = `<div class='text-red-700 bg-red-50 border border-red-200 rounded-xl p-3'>No se pudo cargar desde Google Sheets. Revisa la URL del script y permisos. <br><small>${e?.message||e}</small></div>`;
        showNet('Error');
      }
    }

    // Primer load
    loadPatients();
  })();

  // ================== FINANZAS ==================
  (function initFinance(){
    const mod = $('#moduleFinance');
    if (!mod) return;

    const LS_KEY = 'finance_v1';
    const finance = { categories: [], txs: [], assets: [] };

    // refs
    const finIncome = $('#fin_income');
    const finExpense = $('#fin_expense');
    const finNet = $('#fin_net');
    const finAssetsTotal = $('#fin_assets_total');

    const filterType = $('#fin_filter_type');
    const filterCat  = $('#fin_filter_cat');
    const filterText = $('#fin_filter_text');
    const btnFilterClear = $('#fin_btn_clear');

    const selType = $('#fin_type');
    const selCat  = $('#fin_category');
    const inpDate = $('#fin_date');
    const inpAmount = $('#fin_amount');
    const inpDesc   = $('#fin_desc');
    const btnAdd    = $('#fin_add');

    const inpNewCat = $('#fin_new_cat');
    const btnAddCat = $('#fin_add_cat');
    const catList   = $('#fin_cat_list');

    const finTable = $('#fin_table');
    const btnExportCsv = $('#fin_export_csv');

    const assetName = $('#asset_name');
    const assetValue = $('#asset_value');
    const assetAdd   = $('#asset_add');
    const assetTable = $('#asset_table');

    function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(finance)); }
    function loadLocal(){
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        try{
          const obj = JSON.parse(raw);
          finance.categories = obj.categories || [];
          finance.txs       = obj.txs || [];
          finance.assets    = obj.assets || [];
        }catch{}
      } else {
        finance.categories = [
          { id: uuid('cat_'), name: 'Consulta' },
          { id: uuid('cat_'), name: 'Medicamentos' },
          { id: uuid('cat_'), name: 'Equipos' },
        ];
        saveLocal();
      }
    }

    function setToday(){ if (inpDate) inpDate.value = new Date().toISOString().slice(0,10); }
    function renderCategoryOptions(){
      const opts = ['<option value="">(sin categoría)</option>']
        .concat(finance.categories.map(c=> `<option value="${c.id}">${c.name}</option>`));
      if (selCat) selCat.innerHTML = opts.join('');
      if (filterCat) filterCat.innerHTML = ['<option value="">Categoría (todas)</option>']
        .concat(finance.categories.map(c=> `<option value="${c.id}">${c.name}</option>`)).join('');
    }
    function renderCategoriesChips(){
      if (!catList) return;
      catList.innerHTML = '';
      finance.categories.forEach(c=>{
        const span = document.createElement('span');
        span.className = 'px-3 py-1 rounded-full bg-gray-100 border flex items-center gap-2';
        span.innerHTML = `<span>${c.name}</span><button data-del-cat="${c.id}" class="text-red-600 hover:underline">Eliminar</button>`;
        catList.appendChild(span);
      });
      $$('[data-del-cat]', catList).forEach(b=>{
        b.addEventListener('click', ()=>{
          const id = b.dataset.delCat;
          if(!confirm('Eliminar categoría? (Los movimientos conservarán el id)')) return;
          finance.categories = finance.categories.filter(x=> x.id!==id);
          saveLocal(); renderCategoryOptions(); renderCategoriesChips(); renderFinanceTables();
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
      if (finIncome) finIncome.textContent = money(t.inc);
      if (finExpense) finExpense.textContent = money(t.exp);
      if (finNet) finNet.textContent = money(t.net);
      if (finAssetsTotal) finAssetsTotal.textContent = money(t.assetsSum);
    }
    function renderFinanceTables(){
      // movimientos
      if (finTable){
        const txt = (filterText?.value||'').toLowerCase();
        const rows = finance.txs.filter(t=>{
          const okType = !filterType?.value || t.type===filterType.value;
          const okCat  = !filterCat?.value  || t.categoryId===filterCat.value;
          const okTxt  = !txt || (t.desc||'').toLowerCase().includes(txt);
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
            <td class="py-2 pr-4 text-right">${money(t.amount)}</td>
            <td class="py-2"><button class="text-red-600 hover:underline" data-del-tx="${t.id}">Eliminar</button></td>`;
          finTable.appendChild(tr);
        });
        $$('[data-del-tx]', finTable).forEach(b=>{
          b.addEventListener('click', ()=>{
            const id = b.dataset.delTx;
            if(!confirm('¿Eliminar este movimiento?')) return;
            finance.txs = finance.txs.filter(x=> x.id!==id);
            saveLocal(); renderSummary(); renderFinanceTables();
          });
        });
      }

      // activos
      if (assetTable){
        assetTable.innerHTML = '';
        finance.assets.slice().sort((a,b)=> a.name.localeCompare(b.name)).forEach(a=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="py-2 pr-4">${a.name}</td>
            <td class="py-2 pr-4 text-right">${money(a.value)}</td>
            <td class="py-2"><button class="text-red-600 hover:underline" data-del-asset="${a.id}">Eliminar</button></td>`;
          assetTable.appendChild(tr);
        });
        $$('[data-del-asset]', assetTable).forEach(b=>{
          b.addEventListener('click', ()=>{
            const id = b.dataset.delAsset;
            if(!confirm('¿Eliminar este activo?')) return;
            finance.assets = finance.assets.filter(x=> x.id!==id);
            saveLocal(); renderSummary(); renderFinanceTables();
          });
        });
      }
    }

    // Eventos
    btnAddCat?.addEventListener('click', ()=>{
      const name = (inpNewCat?.value||'').trim();
      if(!name) return alert('Escribe un nombre de categoría.');
      if(finance.categories.some(c=> c.name.toLowerCase()===name.toLowerCase())) return alert('Esa categoría ya existe.');
      finance.categories.push({ id: uuid('cat_'), name });
      if (inpNewCat) inpNewCat.value = '';
      saveLocal(); renderCategoryOptions(); renderCategoriesChips();
    });

    btnAdd?.addEventListener('click', ()=>{
      const type = selType?.value || 'ingreso';
      const date = inpDate?.value || new Date().toISOString().slice(0,10);
      const categoryId = selCat?.value || '';
      const amount = Number(inpAmount?.value||0);
      const desc   = (inpDesc?.value||'').trim();
      if(!amount || amount<=0) return alert('Ingresa un valor mayor a 0.');
      finance.txs.push({ id: uuid('tx_'), type, date, categoryId, amount, desc });
      if (inpAmount) inpAmount.value = '';
      if (inpDesc)   inpDesc.value   = '';
      saveLocal(); renderSummary(); renderFinanceTables();
    });

    [filterType, filterCat, filterText].forEach(el => el?.addEventListener('input', renderFinanceTables));

    btnFilterClear?.addEventListener('click', ()=>{
      if (filterType) filterType.value = '';
      if (filterCat)  filterCat.value  = '';
      if (filterText) filterText.value = '';
      renderFinanceTables();
    });

    assetAdd?.addEventListener('click', ()=>{
      const name = (assetName?.value||'').trim();
      const value = Number(assetValue?.value||0);
      if(!name) return alert('Escribe el nombre del activo.');
      if(!value || value<=0) return alert('Ingresa un valor del activo.');
      finance.assets.push({ id: uuid('as_'), name, value });
      if (assetName)  assetName.value = '';
      if (assetValue) assetValue.value = '';
      saveLocal(); renderSummary(); renderFinanceTables();
    });

    btnExportCsv?.addEventListener('click', ()=>{
      if(!finance.txs.length) return alert('No hay movimientos.');
      const rows = finance.txs.map(t=>({
        id: t.id, fecha: t.date, tipo: t.type,
        categoria: (finance.categories.find(c=>c.id===t.categoryId)||{}).name||'',
        descripcion: t.desc||'',
        valor: t.amount
      }));
      download('movimientos.csv', toCSV(rows));
    });

    // init
    setToday(); loadLocal(); renderCategoryOptions(); renderCategoriesChips(); renderSummary(); renderFinanceTables();
  })();

 // ================== CITAS ==================
(function initAppointments(){
  const mod = $('#moduleAppointments');
  if (!mod) return;

  const LS = 'appointments_v1';
  const d = $('#apt_date'), t = $('#apt_time'), dur = $('#apt_duration'),
        p = $('#apt_patient'), ty = $('#apt_type'), st = $('#apt_status'),
        notes = $('#apt_notes'), add = $('#apt_add');

  const fFrom = $('#apt_filter_from'), fTo = $('#apt_filter_to'),
        fSt = $('#apt_filter_status'), fTxt = $('#apt_filter_text'),
        fClear = $('#apt_filter_clear');

  const table = $('#apt_table'), btnCsv = $('#apt_export_csv');

  const state = { items: [] };

  function today(){ return new Date().toISOString().slice(0,10); }
  function load(){ try{ state.items = JSON.parse(localStorage.getItem(LS)) || []; }catch{ state.items=[]; } }
  function save(){ localStorage.setItem(LS, JSON.stringify(state.items)); }

  // Cambiar estado (Programada / Realizada / Cancelada)
  function changeStatus(id, status){
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    item.status = status;
    save();
    render();
  }

  function render(){
    const from = fFrom?.value || '0000-01-01';
    const to   = fTo?.value   || '9999-12-31';
    const txt  = (fTxt?.value||'').toLowerCase();
    const sts  = fSt?.value || '';

    if (!table) return;

    const rows = state.items.filter(x=>{
      return x.date>=from && x.date<=to &&
             (!sts || x.status===sts) &&
             (!txt || (x.patient+x.notes).toLowerCase().includes(txt));
    }).sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));

    table.innerHTML = '';
    if(!rows.length){
      table.innerHTML = `<tr><td class="py-3 text-gray-500" colspan="8">Sin citas</td></tr>`;
      return;
    }

    rows.forEach(x=>{
      const actions = (x.status === 'Programada')
        ? `
          <button data-done="${x.id}" class="text-emerald-700 hover:underline">Marcar realizada</button>
          <button data-cancel="${x.id}" class="text-red-600 hover:underline ml-2">Cancelar</button>
        `
        : `
          <button data-schedule="${x.id}" class="text-blue-700 hover:underline">Marcar programada</button>
        `;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2 pr-4">${x.date}</td>
        <td class="py-2 pr-4">${x.time}</td>
        <td class="py-2 pr-4">${x.duration} min</td>
        <td class="py-2 pr-4">${x.patient}</td>
        <td class="py-2 pr-4">${x.type}</td>
        <td class="py-2 pr-4">${x.status}</td>
        <td class="py-2 pr-4">${x.notes||''}</td>
        <td class="py-2">${actions}</td>
      `;
      table.appendChild(tr);
    });
  }

  // 🔁 Delegación: un solo listener para todos los botones de la tabla
  table?.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.done)     return changeStatus(btn.dataset.done, 'Realizada');
    if (btn.dataset.cancel)   return changeStatus(btn.dataset.cancel, 'Cancelada');
    if (btn.dataset.schedule) return changeStatus(btn.dataset.schedule, 'Programada');
  });

  // Crear cita
  add?.addEventListener('click', ()=>{
    const item = {
      id: uuid('apt_'),
      date: d?.value || today(),
      time: t?.value || '08:00',
      duration: Number(dur?.value||30),
      patient: (p?.value||'').trim(),
      type: ty?.value || 'Consulta',
      status: st?.value || 'Programada',
      notes: (notes?.value||'').trim()
    };
    if(!item.patient) return alert('Escribe el nombre del paciente.');
    state.items.push(item); save();
    if (p) p.value=''; if (notes) notes.value='';
    render();
  });

  // Filtros y export
  [fFrom,fTo,fSt,fTxt].forEach(el=> el?.addEventListener('input', render));
  fClear?.addEventListener('click', ()=> { if(fFrom)fFrom.value=''; if(fTo)fTo.value=''; if(fSt)fSt.value=''; if(fTxt)fTxt.value=''; render(); });
  btnCsv?.addEventListener('click', ()=>{
    if(!state.items.length) return alert('No hay citas.');
    const rows = state.items.map(r=>({
      id:r.id, fecha:r.date, hora:r.time, duracion:r.duration, paciente:r.patient, tipo:r.type, estado:r.status, notas:r.notes
    }));
    download('citas.csv', toCSV(rows));
  });

  if (d) d.value = today();
  load(); render();
})();

  // ================== TABS (Pacientes / Finanzas / Citas) ==================
  (function initTabs(){
    const pairs = [
      ['tabPacientes', 'modulePatients'],
      ['tabFinanzas',  'moduleFinance'],
      ['tabCitas',     'moduleAppointments'],
    ].filter(([b,m]) => document.getElementById(b) && document.getElementById(m));

    if (!pairs.length) return;

    const btnAdd = $('#btnAdd');
    const btnReload = $('#btnReload');

    function activate(btnId){
      pairs.forEach(([bId,mId])=>{
        const btn = document.getElementById(bId);
        const mod = document.getElementById(mId);
        const on = (bId === btnId);
        mod.classList.toggle('hidden', !on);
        mod.style.display = on ? '' : 'none'; // fallback
        btn.classList.toggle('bg-gray-900', on);
        btn.classList.toggle('text-white', on);
        btn.classList.toggle('bg-gray-200', !on);
      });
      const inPac = (btnId === 'tabPacientes');
      if (btnAdd)    btnAdd.style.display    = inPac ? '' : 'none';
      if (btnReload) btnReload.style.display = inPac ? '' : 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    pairs.forEach(([bId])=>{
      document.getElementById(bId).addEventListener('click', ()=> activate(bId));
    });

    activate('tabPacientes'); // inicio
  })();

});








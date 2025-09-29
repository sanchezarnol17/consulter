// ===== URL /exec (Apps Script) =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxxL7Sau_wC4Vg5-DLzK0y41EjlR6S1hgWEywnLIbUCSKlAoKJQY5doeAchSElQWulpcg/exec';

// ===== Helpers base =====
function $(s, r){ return (r||document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
var netState = $('#netState');
function showNet(m){ if(netState) netState.textContent = m || ''; }

function humanDate(d){ return d ? new Date(d).toISOString().slice(0,10) : '—'; }
function money(n){ return Number(n||0).toLocaleString('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }); }
function uuid(p){ return (p||'id_') + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(3); }

async function apiGet(params){
  const url = new URL(API_URL);
  Object.keys(params||{}).forEach(k=> url.searchParams.set(k, params[k]));
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

// CSV helpers
function toCSV(rows){
  if(!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  function esc(v){ return '"' + String(v==null?'':v).replace(/"/g,'""') + '"'; }
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
var state = { patients: [], query: '' };

document.addEventListener('DOMContentLoaded', function(){

  // -------- Polyfill <dialog> --------
  var dlg = $('#patientDialog');
  if (dlg && !dlg.showModal) {
    dlg.showModal = function(){ dlg.setAttribute('open', ''); };
    dlg.close = function(){ dlg.removeAttribute('open'); };
  }

  // ================== PACIENTES ==================
  (function initPatients(){
    var listEl   = $('#list');
    var detailEl = $('#detail');
    var searchEl = $('#search');
    var form     = $('#patientForm');
    if (!listEl || !detailEl || !searchEl || !form) return;

    var btnAdd    = $('#btnAdd');
    var btnReload = $('#btnReload');
    var btnClear  = $('#btnClear');
    var btnCancel = $('#btnCancel');

    if (btnAdd)    btnAdd.addEventListener('click', function(){ openForm(); });
    if (btnReload) btnReload.addEventListener('click', function(){ loadPatients(); });
    if (btnClear)  btnClear.addEventListener('click', function(){ searchEl.value=''; state.query=''; renderList(); });
    if (btnCancel) btnCancel.addEventListener('click', function(){ if(dlg) dlg.close(); });

    searchEl.addEventListener('input', function(){ state.query = searchEl.value; renderList(); });

    function renderList(){
      detailEl.classList.add('hidden');
      listEl.innerHTML = '';
      var q = (state.query||'').toLowerCase();
      var rows = state.patients.filter(function(p){
        return ( (p.nombre||'') + ' ' + (p.documento||'') + ' ' + (p.telefono||'') ).toLowerCase().indexOf(q) !== -1;
      });
      if(!rows.length){
        listEl.innerHTML = '<div class="text-gray-500">No hay pacientes.</div>';
        return;
      }
      rows.forEach(function(p){
        var div = document.createElement('div');
        div.className = 'bg-white rounded-2xl shadow p-4 flex items-center justify-between';
        div.innerHTML = ''
          + '<div>'
          +   '<button class="text-lg font-semibold hover:underline" data-open="'+p.id+'">'+(p.nombre||'')+'</button>'
          +   '<div class="text-sm text-gray-500">Doc: '+(p.documento||'—')+' · Tel: '+(p.telefono||'—')+' · Reg: '+humanDate(p.fecha_creacion)+'</div>'
          + '</div>'
          + '<div class="flex items-center gap-2">'
          +   '<button class="px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600" data-edit="'+p.id+'">Editar</button>'
          +   '<button class="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700" data-del="'+p.id+'">Eliminar</button>'
          + '</div>';
        listEl.appendChild(div);
      });
      $$.call(null,'[data-open]', listEl).forEach(function(b){ b.addEventListener('click', function(){ openDetail(b.dataset.open); }); });
      $$.call(null,'[data-edit]', listEl).forEach(function(b){ b.addEventListener('click', function(){ openForm(b.dataset.edit); }); });
      $$.call(null,'[data-del]',  listEl).forEach(function(b){ b.addEventListener('click', function(){ deletePatient(b.dataset.del); }); });
    }

    function setVal(sel, val){
      var el = $(sel);
      if (el) el.value = val || '';
    }

    function openForm(id){
      form.reset();

      var titleEl = $('#dialogTitle'); if (titleEl) titleEl.textContent = id ? 'Editar paciente' : 'Nuevo paciente';
      var idEl    = $('#p_id');        if (idEl)    idEl.value = id || '';

      if (id){
        var p = state.patients.find(function(x){ return x.id === id; });
        if (p){
          setVal('#p_full_name',   p.nombre);
          setVal('#p_document_id', p.documento);
          setVal('#p_phone',       p.telefono);
          setVal('#p_email',       p.email);
          setVal('#p_birthdate',   p.fecha_nacimiento);
          setVal('#p_address',     p.direccion);
          setVal('#p_notes',       p.notas);
        }
      }
      if (dlg && dlg.showModal) dlg.showModal();
    }

    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      var idEl = $('#p_id');
      var id = (idEl && idEl.value) ? idEl.value : ('p_' + Date.now().toString(36));
      var payload = {
        action: 'upsert_patient',
        data: {
          id: id,
          nombre: ($('#p_full_name')||{}).value ? $('#p_full_name').value.trim() : '',
          documento: ($('#p_document_id')||{}).value ? $('#p_document_id').value.trim() : '',
          telefono: ($('#p_phone')||{}).value ? $('#p_phone').value.trim() : '',
          email: ($('#p_email')||{}).value ? $('#p_email').value.trim() : '',
          fecha_nacimiento: ($('#p_birthdate')||{}).value || '',
          direccion: ($('#p_address')||{}).value ? $('#p_address').value.trim() : '',
          notas: ($('#p_notes')||{}).value ? $('#p_notes').value.trim() : ''
        }
      };
      if(!payload.data.nombre){ alert('El nombre es obligatorio.'); return; }
      try{
        showNet('Guardando...');
        await apiPost(payload);
        if (dlg) dlg.close();
        await loadPatients();
        showNet('Guardado ✓'); setTimeout(function(){ showNet(''); }, 1500);
      }catch(e){ alert('Error guardando: '+(e && e.message ? e.message : e)); showNet('Error'); }
    });

    async function deletePatient(id){
      var p = state.patients.find(function(x){ return x.id === id; });
      if(!p) return;
      if(!confirm('¿Eliminar a "'+(p.nombre||'')+'"?')) return;
      try{
        showNet('Eliminando...');
        await apiPost({ action:'delete_patient', data:{ id:id } });
        await loadPatients();
        showNet('Eliminado ✓'); setTimeout(function(){ showNet(''); }, 1500);
      }catch(e){ alert('Error: '+(e && e.message ? e.message : e)); }
    }

    async function openDetail(id){
      var p = state.patients.find(function(x){ return x.id === id; });
      if(!p) return;
      detailEl.classList.remove('hidden');
      detailEl.innerHTML = ''
        + '<div class="bg-white rounded-2xl shadow p-6 mb-4">'
        + '  <div class="flex items-start justify-between">'
        + '    <div>'
        + '      <h2 class="text-2xl font-bold">'+(p.nombre||'')+'</h2>'
        + '      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm">'
        + '        <div><span class="text-gray-500">Documento:</span> '+(p.documento||'—')+'</div>'
        + '        <div><span class="text-gray-500">Teléfono:</span> '+(p.telefono||'—')+'</div>'
        + '        <div><span class="text-gray-500">Email:</span> '+(p.email||'—')+'</div>'
        + '        <div><span class="text-gray-500">Fecha nac.:</span> '+humanDate(p.fecha_nacimiento)+'</div>'
        + '        <div class="md:col-span-2"><span class="text-gray-500">Dirección:</span> '+(p.direccion||'—')+'</div>'
        + '        <div class="md:col-span-2"><span class="text-gray-500">Notas:</span> '+(p.notas||'—')+'</div>'
        + '      </div>'
        + '    </div>'
        + '    <div class="space-x-2"><button class="px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600" data-edit="'+p.id+'">Editar</button></div>'
        + '  </div>'
        + '</div>'
        + '<div class="bg-white rounded-2xl shadow p-6">'
        + '  <h3 class="text-xl font-semibold mb-3">Historial clínico</h3>'
        + '  <form id="histForm" class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">'
        + '    <input type="date" id="h_date" class="px-3 py-2 rounded-xl border" value="'+new Date().toISOString().slice(0,10)+'" />'
        + '    <input id="h_summary" class="md:col-span-2 px-3 py-2 rounded-xl border" placeholder="Resumen (Motivo/Diagnóstico/Procedimiento)" />'
        + '    <textarea id="h_details" rows="3" class="md:col-span-3 px-3 py-2 rounded-xl border" placeholder="Detalles/Observaciones"></textarea>'
        + '    <div class="md:col-span-3"><button class="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700">Añadir</button></div>'
        + '  </form>'
        + '  <div id="historyList" class="grid gap-3"></div>'
        + '</div>';

      var editBtn = detailEl.querySelector('[data-edit]');
      if (editBtn) editBtn.addEventListener('click', function(){ openForm(p.id); });

      var histForm = $('#histForm');
      var hList    = $('#historyList');

      function renderHistory(items){
        var rows = (items||[]).slice().sort(function(a,b){ return String(b.fecha||'').localeCompare(String(a.fecha||'')); });
        hList.innerHTML = rows.length ? '' : '<div class="text-gray-500">Aún no hay registros.</div>';
        rows.forEach(function(h){
          var art = document.createElement('article');
          art.className = 'bg-gray-50 rounded-2xl p-4 border';
          art.innerHTML = ''
            + '<div class="flex items-center justify-between">'
            + '  <div class="font-medium">'+humanDate(h.fecha)+' — '+(h.resumen||'')+'</div>'
            + '  <button class="text-red-600 hover:underline" data-del-h="'+h.id+'">Eliminar</button>'
            + '</div>'
            + (h.detalles ? '<p class="text-sm text-gray-700 mt-1 whitespace-pre-line">'+h.detalles+'</p>' : '');
          hList.appendChild(art);
        });
        $$.call(null,'[data-del-h]', hList).forEach(function(btn){
          btn.addEventListener('click', async function(){
            if(!confirm('¿Eliminar esta entrada del historial?')) return;
            try{
              showNet('Eliminando historial...');
              await apiPost({ action:'delete_history', data:{ id: btn.dataset.delH, patient_id: p.id } });
              await loadHistory();
              showNet('Eliminado ✓'); setTimeout(function(){ showNet(''); }, 1500);
            }catch(e){ alert('Error eliminando historial: '+(e && e.message ? e.message : e)); }
          });
        });
      }

      async function loadHistory(){
        try{
          showNet('Cargando historial...');
          var data = await apiGet({ mode:'histories', patient_id: p.id });
          renderHistory(data);
          showNet('');
        }catch(e){
          hList.innerHTML = "<div class='text-red-700 bg-red-50 border border-red-200 rounded-xl p-3'>No se pudo cargar el historial.<br><small>"+(e && e.message ? e.message : e)+'</small></div>';
          showNet('Error');
        }
      }

      histForm.addEventListener('submit', async function(e){
        e.preventDefault();
        var summaryEl = $('#h_summary');
        var summary = summaryEl && summaryEl.value ? summaryEl.value.trim() : '';
        if(!summary){ alert('El resumen es obligatorio.'); return; }
        try{
          showNet('Guardando historial...');
          await apiPost({ action:'add_history', data:{
            id: 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
            patient_id: p.id,
            fecha: ($('#h_date')&&$('#h_date').value) ? $('#h_date').value : new Date().toISOString().slice(0,10),
            resumen: summary,
            detalles: ($('#h_details')&&$('#h_details').value) ? $('#h_details').value.trim() : ''
          }});
          histForm.reset();
          var dEl = $('#h_date'); if (dEl) dEl.value = new Date().toISOString().slice(0,10);
          await loadHistory();
          showNet('Historial guardado ✓'); setTimeout(function(){ showNet(''); }, 1500);
        }catch(err){ alert('Error guardando historial: '+(err && err.message ? err.message : err)); showNet('Error'); }
      });

      await loadHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function loadPatients(){
      try{
        showNet('Cargando...');
        var data = await apiGet({ mode:'patients' });
        state.patients = Array.isArray(data)?data:[];
        renderList();
        showNet('');
      } catch(e){
        listEl.innerHTML = "<div class='text-red-700 bg-red-50 border border-red-200 rounded-xl p-3'>No se pudo cargar desde Google Sheets. Revisa la URL del script y permisos.<br><small>"+(e && e.message ? e.message : e)+'</small></div>';
        showNet('Error');
      }
    }

    loadPatients();
  })();

  // ================== FINANZAS ==================
  (function initFinance(){
    var mod = $('#moduleFinance');
    if (!mod) return;

    var LS_KEY = 'finance_v1';
    var finance = { categories: [], txs: [], assets: [] };

    var finIncome = $('#fin_income');
    var finExpense = $('#fin_expense');
    var finNet = $('#fin_net');
    var finAssetsTotal = $('#fin_assets_total');

    var filterType = $('#fin_filter_type');
    var filterCat  = $('#fin_filter_cat');
    var filterText = $('#fin_filter_text');
    var btnFilterClear = $('#fin_btn_clear');

    var selType = $('#fin_type');
    var selCat  = $('#fin_category');
    var inpDate = $('#fin_date');
    var inpAmount = $('#fin_amount');
    var inpDesc   = $('#fin_desc');
    var btnAdd    = $('#fin_add');

    var inpNewCat = $('#fin_new_cat');
    var btnAddCat = $('#fin_add_cat');
    var catList   = $('#fin_cat_list');

    var finTable = $('#fin_table');
    var btnExportCsv = $('#fin_export_csv');

    var assetName = $('#asset_name');
    var assetValue = $('#asset_value');
    var assetAdd   = $('#asset_add');
    var assetTable = $('#asset_table');

    function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(finance)); }
    function loadLocal(){
      var raw = localStorage.getItem(LS_KEY);
      if(raw){
        try{
          var obj = JSON.parse(raw);
          finance.categories = obj.categories || [];
          finance.txs       = obj.txs || [];
          finance.assets    = obj.assets || [];
        }catch(e){}
      } else {
        finance.categories = [
          { id: uuid('cat_'), name: 'Consulta' },
          { id: uuid('cat_'), name: 'Medicamentos' },
          { id: uuid('cat_'), name: 'Equipos' }
        ];
        saveLocal();
      }
    }

    function setToday(){ if (inpDate) inpDate.value = new Date().toISOString().slice(0,10); }
    function renderCategoryOptions(){
      var opts = ['<option value="">(sin categoría)</option>'].concat(finance.categories.map(function(c){ return '<option value="'+c.id+'">'+c.name+'</option>'; }));
      if (selCat) selCat.innerHTML = opts.join('');
      if (filterCat){
        filterCat.innerHTML = ['<option value="">Categoría (todas)</option>'].concat(finance.categories.map(function(c){ return '<option value="'+c.id+'">'+c.name+'</option>'; })).join('');
      }
    }
    function renderCategoriesChips(){
      if (!catList) return;
      catList.innerHTML = '';
      finance.categories.forEach(function(c){
        var span = document.createElement('span');
        span.className = 'px-3 py-1 rounded-full bg-gray-100 border flex items-center gap-2';
        span.innerHTML = '<span>'+c.name+'</span><button data-del-cat="'+c.id+'" class="text-red-600 hover:underline">Eliminar</button>';
        catList.appendChild(span);
      });
      $$.call(null,'[data-del-cat]', catList).forEach(function(b){
        b.addEventListener('click', function(){
          var id = b.dataset.delCat;
          if(!confirm('Eliminar categoría? (Los movimientos conservarán el id)')) return;
          finance.categories = finance.categories.filter(function(x){ return x.id!==id; });
          saveLocal(); renderCategoryOptions(); renderCategoriesChips(); renderFinanceTables();
        });
      });
    }
    function totals(){
      var inc = finance.txs.filter(function(t){ return t.type==='ingreso'; }).reduce(function(s,t){ return s+Number(t.amount||0); }, 0);
      var exp = finance.txs.filter(function(t){ return t.type==='gasto'; }).reduce(function(s,t){ return s+Number(t.amount||0); }, 0);
      var assetsSum = finance.assets.reduce(function(s,a){ return s+Number(a.value||0); }, 0);
      return { inc:inc, exp:exp, net:inc-exp, assetsSum:assetsSum };
    }
    function renderSummary(){
      var t = totals();
      if (finIncome)  finIncome.textContent  = money(t.inc);
      if (finExpense) finExpense.textContent = money(t.exp);
      if (finNet)     finNet.textContent     = money(t.net);
      if (finAssetsTotal) finAssetsTotal.textContent = money(t.assetsSum);
    }
    function renderFinanceTables(){
      if (finTable){
        var txt = (filterText && filterText.value || '').toLowerCase();
        var rows = finance.txs.filter(function(t){
          var okType = !filterType || !filterType.value || t.type===filterType.value;
          var okCat  = !filterCat  || !filterCat.value  || t.categoryId===filterCat.value;
          var okTxt  = !txt || (t.desc||'').toLowerCase().indexOf(txt)!==-1;
          return okType && okCat && okTxt;
        }).sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); });

        finTable.innerHTML = '';
        rows.forEach(function(t){
          var tr = document.createElement('tr');
          tr.innerHTML = ''
            + '<td class="py-2 pr-4">'+(t.date||'—')+'</td>'
            + '<td class="py-2 pr-4 capitalize">'+t.type+'</td>'
            + '<td class="py-2 pr-4">'+((finance.categories.find(function(c){return c.id===t.categoryId;})||{}).name||'—')+'</td>'
            + '<td class="py-2 pr-4">'+(t.desc||'')+'</td>'
            + '<td class="py-2 pr-4 text-right">'+money(t.amount)+'</td>'
            + '<td class="py-2"><button class="text-red-600 hover:underline" data-del-tx="'+t.id+'">Eliminar</button></td>';
          finTable.appendChild(tr);
        });
        $$.call(null,'[data-del-tx]', finTable).forEach(function(b){
          b.addEventListener('click', function(){
            var id = b.dataset.delTx;
            if(!confirm('¿Eliminar este movimiento?')) return;
            finance.txs = finance.txs.filter(function(x){ return x.id!==id; });
            saveLocal(); renderSummary(); renderFinanceTables();
          });
        });
      }

      if (assetTable){
        assetTable.innerHTML = '';
        finance.assets.slice().sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(a){
          var tr = document.createElement('tr');
          tr.innerHTML = ''
            + '<td class="py-2 pr-4">'+a.name+'</td>'
            + '<td class="py-2 pr-4 text-right">'+money(a.value)+'</td>'
            + '<td class="py-2"><button class="text-red-600 hover:underline" data-del-asset="'+a.id+'">Eliminar</button></td>';
          assetTable.appendChild(tr);
        });
        $$.call(null,'[data-del-asset]', assetTable).forEach(function(b){
          b.addEventListener('click', function(){
            var id = b.dataset.delAsset;
            if(!confirm('¿Eliminar este activo?')) return;
            finance.assets = finance.assets.filter(function(x){ return x.id!==id; });
            saveLocal(); renderSummary(); renderFinanceTables();
          });
        });
      }
    }

    if (btnAddCat) btnAddCat.addEventListener('click', function(){
      var name = (inpNewCat && inpNewCat.value ? inpNewCat.value.trim() : '');
      if(!name) return alert('Escribe un nombre de categoría.');
      if(finance.categories.some(function(c){ return c.name.toLowerCase()===name.toLowerCase(); })) return alert('Esa categoría ya existe.');
      finance.categories.push({ id: uuid('cat_'), name: name });
      if (inpNewCat) inpNewCat.value = '';
      saveLocal(); renderCategoryOptions(); renderCategoriesChips();
    });

    if (btnAdd) btnAdd.addEventListener('click', function(){
      var type = (selType && selType.value) || 'ingreso';
      var date = (inpDate && inpDate.value) || new Date().toISOString().slice(0,10);
      var categoryId = (selCat && selCat.value) || '';
      var amount = Number((inpAmount && inpAmount.value) || 0);
      var desc   = (inpDesc && inpDesc.value ? inpDesc.value.trim() : '');
      if(!amount || amount<=0) return alert('Ingresa un valor mayor a 0.');
      finance.txs.push({ id: uuid('tx_'), type: type, date: date, categoryId: categoryId, amount: amount, desc: desc });
      if (inpAmount) inpAmount.value = '';
      if (inpDesc)   inpDesc.value   = '';
      saveLocal(); renderSummary(); renderFinanceTables();
    });

    [filterType, filterCat, filterText].forEach(function(el){
      if (el) el.addEventListener('input', renderFinanceTables);
    });

    if (btnFilterClear) btnFilterClear.addEventListener('click', function(){
      if (filterType) filterType.value = '';
      if (filterCat)  filterCat.value  = '';
      if (filterText) filterText.value = '';
      renderFinanceTables();
    });

    if (assetAdd) assetAdd.addEventListener('click', function(){
      var name = (assetName && assetName.value ? assetName.value.trim() : '');
      var value = Number((assetValue && assetValue.value) || 0);
      if(!name) return alert('Escribe el nombre del activo.');
      if(!value || value<=0) return alert('Ingresa un valor del activo.');
      finance.assets.push({ id: uuid('as_'), name: name, value: value });
      if (assetName)  assetName.value = '';
      if (assetValue) assetValue.value = '';
      saveLocal(); renderSummary(); renderFinanceTables();
    });

    if (btnExportCsv) btnExportCsv.addEventListener('click', function(){
      if(!finance.txs.length) return alert('No hay movimientos.');
      var rows = finance.txs.map(function(t){
        return {
          id: t.id, fecha: t.date, tipo: t.type,
          categoria: (finance.categories.find(function(c){return c.id===t.categoryId;})||{}).name||'',
          descripcion: t.desc||'',
          valor: t.amount
        };
      });
      download('movimientos.csv', toCSV(rows));
    });

    setToday(); loadLocal(); renderCategoryOptions(); renderCategoriesChips(); renderSummary(); renderFinanceTables();
  })();

  // ================== CITAS ==================
  (function initAppointments(){
    var mod = $('#moduleAppointments');
    if (!mod) return;

    var LS = 'appointments_v1';
    var d = $('#apt_date'), t = $('#apt_time'), dur = $('#apt_duration'),
        p = $('#apt_patient'), ty = $('#apt_type'), st = $('#apt_status'),
        notes = $('#apt_notes'), add = $('#apt_add');

    var fFrom = $('#apt_filter_from'), fTo = $('#apt_filter_to'),
        fSt = $('#apt_filter_status'), fTxt = $('#apt_filter_text'),
        fClear = $('#apt_filter_clear');

    var table = $('#apt_table'), btnCsv = $('#apt_export_csv');
    var state = { items: [] };

    function today(){ return new Date().toISOString().slice(0,10); }
    function load(){ try{ state.items = JSON.parse(localStorage.getItem(LS)) || []; }catch(e){ state.items=[]; } }
    function save(){ localStorage.setItem(LS, JSON.stringify(state.items)); }

    function changeStatus(id, status){
      var item = state.items.find(function(i){ return i.id === id; });
      if (!item) return;
      item.status = status;
      save(); render();
    }

    function render(){
      var from = (fFrom && fFrom.value) || '0000-01-01';
      var to   = (fTo && fTo.value)   || '9999-12-31';
      var txt  = ((fTxt && fTxt.value) || '').toLowerCase();
      var sts  = (fSt && fSt.value) || '';

      if (!table) return;

      var rows = state.items.filter(function(x){
        return x.date>=from && x.date<=to &&
               (!sts || x.status===sts) &&
               (!txt || (x.patient+x.notes).toLowerCase().indexOf(txt)!==-1);
      }).sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });

      table.innerHTML = '';
      if(!rows.length){
        table.innerHTML = '<tr><td class="py-3 text-gray-500" colspan="8">Sin citas</td></tr>';
        return;
      }

      rows.forEach(function(x){
        var actions = (x.status === 'Programada')
          ? '<button data-done="'+x.id+'" class="text-emerald-700 hover:underline">Marcar realizada</button>'
            + '<button data-cancel="'+x.id+'" class="text-red-600 hover:underline ml-2">Cancelar</button>'
          : '<button data-schedule="'+x.id+'" class="text-blue-700 hover:underline">Marcar programada</button>';

        var tr = document.createElement('tr');
        tr.innerHTML = ''
          + '<td class="py-2 pr-4">'+x.date+'</td>'
          + '<td class="py-2 pr-4">'+x.time+'</td>'
          + '<td class="py-2 pr-4">'+x.duration+' min</td>'
          + '<td class="py-2 pr-4">'+x.patient+'</td>'
          + '<td class="py-2 pr-4">'+x.type+'</td>'
          + '<td class="py-2 pr-4">'+x.status+'</td>'
          + '<td class="py-2 pr-4">'+(x.notes||'')+'</td>'
          + '<td class="py-2">'+actions+'</td>';
        table.appendChild(tr);
      });
    }

    if (table) table.addEventListener('click', function(ev){
      var btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!btn) return;
      if (btn.dataset.done)     return changeStatus(btn.dataset.done, 'Realizada');
      if (btn.dataset.cancel)   return changeStatus(btn.dataset.cancel, 'Cancelada');
      if (btn.dataset.schedule) return changeStatus(btn.dataset.schedule, 'Programada');
    });

    if (add) add.addEventListener('click', function(){
      var item = {
        id: uuid('apt_'),
        date: (d && d.value) || today(),
        time: (t && t.value) || '08:00',
        duration: Number((dur && dur.value) || 30),
        patient: (p && p.value ? p.value.trim() : ''),
        type: (ty && ty.value) || 'Consulta',
        status: (st && st.value) || 'Programada',
        notes: (notes && notes.value ? notes.value.trim() : '')
      };
      if(!item.patient) return alert('Escribe el nombre del paciente.');
      state.items.push(item); save();
      if (p) p.value=''; if (notes) notes.value='';
      render();
    });

    [fFrom,fTo,fSt,fTxt].forEach(function(el){ if(el) el.addEventListener('input', render); });
    if (fClear) fClear.addEventListener('click', function(){ if(fFrom)fFrom.value=''; if(fTo)fTo.value=''; if(fSt)fSt.value=''; if(fTxt)fTxt.value=''; render(); });
    if (btnCsv) btnCsv.addEventListener('click', function(){
      if(!state.items.length) return alert('No hay citas.');
      var rows = state.items.map(function(r){
        return { id:r.id, fecha:r.date, hora:r.time, duracion:r.duration, paciente:r.patient, tipo:r.type, estado:r.status, notas:r.notes };
      });
      download('citas.csv', toCSV(rows));
    });

    if (d) d.value = today();
    load(); render();
  })();

  // ================== TABS (Pacientes / Finanzas / Citas) ==================
  (function initTabs(){
    var pairs = [
      ['tabPacientes', 'modulePatients'],
      ['tabFinanzas',  'moduleFinance'],
      ['tabCitas',     'moduleAppointments']
    ].filter(function(pair){ return document.getElementById(pair[0]) && document.getElementById(pair[1]); });
    if (!pairs.length) return;

    var btnAdd = $('#btnAdd');
    var btnReload = $('#btnReload');

    function activate(btnId){
      pairs.forEach(function(pair){
        var bId = pair[0], mId = pair[1];
        var btn = document.getElementById(bId);
        var mod = document.getElementById(mId);
        var on = (bId === btnId);
        mod.classList.toggle('hidden', !on);
        mod.style.display = on ? '' : 'none';
        btn.classList.toggle('bg-gray-900', on);
        btn.classList.toggle('text-white', on);
        btn.classList.toggle('bg-gray-200', !on);
      });
      var inPac = (btnId === 'tabPacientes');
      if (btnAdd)    btnAdd.style.display    = inPac ? '' : 'none';
      if (btnReload) btnReload.style.display = inPac ? '' : 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    pairs.forEach(function(pair){
      var bId = pair[0];
      var b = document.getElementById(bId);
      if (b) b.addEventListener('click', function(){ activate(bId); });
    });

    activate('tabPacientes');
  })();

});

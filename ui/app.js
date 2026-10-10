const api = window.fabBrowser;
const input = document.querySelector('#input');
const status = document.querySelector('#status');
const identity = document.querySelector('#identity');
const initial = await api.initial();
input.value = initial.apps[0].container;
const open = () => api.navigate(input.value);
document.querySelector('#address').onsubmit = event => {event.preventDefault();void open();};
document.querySelector('#demo').onclick = () => {input.value = initial.apps[0].container;void open();};
for(const name of ['back','forward','reload','developer']) document.querySelector(`#${name}`).onclick = () => api[name]().catch(error => {status.textContent=error.message;});
api.onState(state => {
  status.textContent = state.message;
  identity.textContent = state.container ? `${state.title} · X Layer ${state.chainId} · 版本 ${state.version} · CID ${state.cid}` : 'FAB 测试环境';
  status.dataset.state = state.status;
});

const librarySelect=document.querySelector('#library');
async function refreshLibrary(){const value=await api.library();librarySelect.replaceChildren(new Option('历史／书签',''));for(const [label,rows] of [['★',value.bookmarks],['最近',value.history]])for(const row of rows)librarySelect.add(new Option(`${label} ${row.title}`,row.container));}
document.querySelector('#bookmark').onclick=async()=>{await api.bookmark();await refreshLibrary();};
librarySelect.onchange=()=>{if(librarySelect.value){input.value=librarySelect.value;void open();}};
api.onState(state=>{if(state.status==='ready')void refreshLibrary();});
void refreshLibrary();

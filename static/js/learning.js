(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const subjects = { analysis: "数学分析", linear: "线性代数" };
  const states = [ ["unsolved","不会","#e8ba62"], ["wrong","错题","#df947e"], ["reviewing","待复习","#91c6fa"], ["mastered","已掌握","#2476dc"] ];
  let data = null, subject = "all", query = "", poll = null, sequence = 0;
  function node(tag, cls, text) { const e=document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e; }
  async function get(path) {
    const response = await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json"}});
    if(response.status===401) { location.replace('/login?next=/learning'); throw new Error('请重新登录'); }
    const result = await response.json();
    if(!response.ok) throw new Error(result.error || "学习记录暂时无法载入");
    return result;
  }
  function renderKnowledge() {
    const root=$("knowledge-list"); root.replaceChildren();
    const rows=data.knowledge.filter(t=>(subject==="all" || t.subject===subject) && (!query || (t.name+" "+t.chapters.join(" ")).toLowerCase().includes(query)));
    for(const topic of rows) {
      const level=topic.mastery===null?"unknown":topic.mastery<50?"weak":topic.mastery<80?"moderate":"strong";
      const item=node("a",`knowledge-item ${level}`);
      item.href='/?'+new URLSearchParams({subject:topic.subject,tag:topic.name}).toString();
      const title=node("div","knowledge-title"); title.append(node("span","",topic.name),node("b","",topic.mastery===null?"待评估":`${topic.mastery}%`));
      const progress=node("div","knowledge-progress"); const bar=node("i"); bar.style.width=`${topic.mastery||0}%`; progress.append(bar);
      item.append(title,node("div","knowledge-chapter",`${subjects[topic.subject]} · ${topic.chapters.join(" / ")||"章节待整理"}`),progress,node("div","knowledge-meta",`${topic.count} 道题 · ${topic.assessed} 道有评估记录${topic.due?` · ${topic.due} 道待复习`:""}`));
      root.append(item);
    }
    if(!rows.length) root.append(node("p","knowledge-empty",query||subject!=="all"?"没有找到对应知识点":"题目解析完成后，知识点会自动出现在这里"));
    $("knowledge-note").textContent=`共 ${rows.length} 个知识点${data.unclassified?`，另有 ${data.unclassified} 道题等待知识点整理`:""}。一道题可以涉及多个知识点。`;
  }
  function renderCharts() {
    $("learning-total").textContent=data.total;
    $("learning-mastered").textContent=data.mastered;
    $("learning-due").textContent=data.due;
    $("learning-topics").textContent=data.knowledge.length;
    const percent=data.total?Math.round(data.mastered/data.total*100):0;
    $("learning-percent").textContent=data.total?`${percent}%`:"—";
    $("learning-donut").setAttribute("aria-label",data.total?`${data.total} 道题，已掌握 ${data.mastered} 道，占 ${percent}%`:"暂无题目");
    let angle=0; const stops=[];
    const legend=$("learning-legend"); legend.replaceChildren();
    for(const [key,label,color] of states) {
      const count=data.by_status[key]||0, end=angle+(data.total?count/data.total*360:0);
      if(count) stops.push(`${color} ${angle}deg ${end}deg`); angle=end;
      const line=node("div"); const dot=node("i"); dot.style.background=color; line.append(dot,node("span","",label),node("b","",`${count} 道`)); legend.append(line);
    }
    $("learning-donut").style.background=stops.length?`conic-gradient(${stops.join(",")})`:"#edf3fa";
    const distribution=$("learning-subjects"); distribution.replaceChildren();
    for(const [key,label] of Object.entries(subjects)) distribution.append(node("span","",`${label} ${data.by_subject[key]||0} 道`));
    const days=data.activity.slice(-14), max=Math.max(1,...days.map(d=>d.added+d.reviewed));
    const bars=$("learning-bars"); bars.replaceChildren();
    for(let i=0;i<days.length;i++) {
      const day=days[i], total=day.added+day.reviewed;
      const button=node("button","learning-bar"); button.type="button";
      const detail=`${day.date}：录题 ${day.added} 道，复习 ${day.reviewed} 次`;
      button.setAttribute("aria-label",detail); button.title=detail;
      const column=node("span","bar-column"); column.style.height=`${Math.max(2,total/max*135)}px`;
      const added=node("i","added"), reviewed=node("i","reviewed");
      added.style.height=`${total?day.added/total*100:0}%`; reviewed.style.height=`${total?day.reviewed/total*100:0}%`;
      column.append(added,reviewed);
      button.append(node("span","bar-value",total||""),column,node("span","bar-date",(i%3===0&&i<days.length-2)||i===days.length-1?day.date.slice(5).replace("-","/"):""));
      button.addEventListener("click",()=>$("learning-bar-detail").textContent=detail);
      bars.append(button);
    }
    const heatmap=$("learning-heatmap"); heatmap.replaceChildren();
    // Local noon avoids timezone and daylight-saving boundary shifts.
    const first=new Date(`${data.activity[0].date}T12:00:00`), padding=(first.getDay()+6)%7;
    for(let i=0;i<padding;i++) heatmap.append(node("i","heatmap-padding"));
    let active=0;
    for(const day of data.activity) {
      const count=day.added+day.reviewed;
      if(count)active++;
      const button=node("button"); button.type="button";
      button.dataset.level=count>=6?4:count>=4?3:count>=2?2:count>=1?1:0;
      const detail=`${day.date}：录题 ${day.added} 道，复习 ${day.reviewed} 次`;
      button.setAttribute("aria-label",detail); button.title=detail;
      button.addEventListener("click",()=>$("learning-day-detail").textContent=detail);
      heatmap.append(button);
    }
    $("learning-active-days").textContent=`${active} 天留下记录`;
    $("mastery-explanation").textContent=data.mastery_note;
    const notes=[];
    if(data.ai_pending)notes.push(`${data.ai_pending} 道题正在自动识别、解析与整理知识点`);
    if(data.ai_errors)notes.push(`${data.ai_errors} 道题的自动处理需要重试，可在错题本查看`);
    $("learning-ai-note").hidden=!notes.length;
    $("learning-ai-note").textContent=notes.join("；");
    renderKnowledge();
  }
  async function load(silent=false) {
    const current=++sequence;
    clearTimeout(poll);
    $("learning-refresh").disabled=true;
    try {
      const result=await get('/api/learning');
      if(current!==sequence)return;
      data=result; renderCharts();
      $("learning-error").hidden=true;
      $("learning-content").hidden=false;
      if(data.ai_pending && !document.hidden) poll=setTimeout(()=>load(true),5000);
    } catch(error) {
      if(current!==sequence)return;
      $("learning-error").textContent=error.message;
      $("learning-error").hidden=false;
    } finally {
      if(current===sequence) { $("learning-refresh").disabled=false; $("learning-loading").hidden=true; }
    }
  }
  $("learning-refresh").addEventListener('click',()=>load());
  document.querySelectorAll('[data-subject]').forEach(button=>button.addEventListener('click',()=>{
    subject=button.dataset.subject;
    document.querySelectorAll('[data-subject]').forEach(b=>{const active=b.dataset.subject===subject;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    if(data)renderKnowledge();
  }));
  $("knowledge-search").addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();if(data)renderKnowledge();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(poll);else load(true);});
  load();
})();

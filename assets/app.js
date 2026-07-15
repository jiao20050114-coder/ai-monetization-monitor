(() => {
  'use strict';

  const D = window.__DATA__;
  const META = window.__SYNC_META__ || {};
  const $ = (selector) => document.querySelector(selector);
  const COLORS = ['#178c7c','#3978a9','#e36f3d','#7b68b5','#c49a3a','#c74a44','#53a7a0','#8897a8','#a06843','#75a05d'];
  const LAB_NAMES = {anthropic:'Anthropic',openai:'OpenAI',google:'Google',deepseek:'DeepSeek','x-ai':'xAI',moonshotai:'Moonshot',qwen:'Qwen','z-ai':'Z.ai',minimax:'MiniMax',others:'Others','long-tail':'Long tail'};
  const num = (value, digits = 1) => Number(value || 0).toLocaleString('en-US', {maximumFractionDigits: digits});
  const last = (arr) => Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
  const dayMs = 86400000;

  function shortDate(value) {
    if (!value) return '—';
    const text = String(value).slice(0, 10);
    return text.replaceAll('-', '.');
  }

  function daysOld(value) {
    const time = Date.parse(String(value || '').slice(0, 10) + 'T00:00:00Z');
    return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / dayMs)) : 999;
  }

  function movingAverage(points, windowSize = 7) {
    return points.map((point, index) => {
      const window = points.slice(Math.max(0, index - windowSize + 1), index + 1);
      return [point[0], +(window.reduce((sum, item) => sum + Number(item[1]), 0) / window.length).toFixed(2)];
    });
  }

  function chart(id, option) {
    const node = document.getElementById(id);
    if (!node || !window.echarts) return null;
    const instance = echarts.init(node, null, {renderer:'canvas'});
    const base = {
      animationDuration: 650,
      animationEasing: 'cubicOut',
      color: COLORS,
      textStyle: {fontFamily:'SF Pro Text, PingFang SC, sans-serif', color:'#718094'},
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(16,33,55,.96)',
        borderWidth: 0,
        padding: [9, 11],
        textStyle: {color:'#fff', fontSize:10},
        axisPointer: {lineStyle:{color:'#9aaba4', type:'dashed'}}
      },
      legend: {top:12, right:16, type:'scroll', itemWidth:12, itemHeight:3, textStyle:{color:'#718094', fontSize:9}},
      grid: {left:54, right:24, top:48, bottom:42, containLabel:false},
      xAxis: {
        type:'category', boundaryGap:false,
        axisLine:{lineStyle:{color:'#cfd7d3'}}, axisTick:{show:false},
        axisLabel:{color:'#8290a0', fontSize:9, hideOverlap:true},
        splitLine:{show:false}
      },
      yAxis: {
        type:'value',
        axisLine:{show:false}, axisTick:{show:false},
        axisLabel:{color:'#8290a0', fontSize:9},
        splitLine:{lineStyle:{color:'#e8ece9', type:'dashed'}}
      }
    };
    instance.setOption({...base, ...option});
    return instance;
  }

  if (!D) {
    document.body.innerHTML = '<main style="padding:60px;font-family:PingFang SC,sans-serif"><h1>数据文件未加载</h1><p>请确认 data/data.js 存在后重新打开页面。</p></main>';
    return;
  }

  const instances = [];
  const addChart = (id, option) => { const c = chart(id, option); if (c) instances.push(c); };
  addEventListener('resize', () => instances.forEach((instance) => instance.resize()));

  function renderQuality() {
    const dates = {
      ARR: D.arr?.updated,
      Token: D.openrouter?.latest_date || D.openrouter?.as_of,
      Gateway: D.vercel?.as_of,
      GPU: D.gpu?.as_of,
      DC: D.datacenters?.as_of,
      SDK: D.sdk?.as_of
    };
    const newest = D.arr?.updated || D.openrouter?.latest_date || META.source_updated_at;
    $('#heroAsOf').textContent = `数据更新 ${shortDate(newest)}`;
    $('#syncDate').textContent = shortDate(META.synced_at || newest);
    const worstAge = Math.max(...Object.values(dates).map(daysOld));
    const good = META.ok !== false && worstAge <= 3;
    $('#syncLed').className = good ? 'ok' : 'warn';
    $('#syncText').textContent = good ? '已通过结构与样本校验 · 自动同步正常' : '正在使用最后一次有效快照 · 请检查同步任务';
    $('#qualityGrid').innerHTML = Object.entries(dates).map(([key, value]) => {
      const fresh = daysOld(value) <= 3;
      return `<span class="${fresh ? 'fresh' : 'stale'}" title="${value || '无日期'}">${key} ${fresh ? '✓' : '!'}</span>`;
    }).join('');
  }

  function metricCard(label, value, subLeft, subRight = '', color = '#edf3f0') {
    return `<article class="metric-card" style="--wash:${color}">
      <div class="metric-label"><span>${label}</span><b>LIVE EST.</b></div>
      <div class="metric-value">${value}</div>
      <div class="metric-sub"><span>${subLeft}</span><span>${subRight}</span></div>
    </article>`;
  }

  function renderArr() {
    const companies = D.arr?.companies || {};
    let total = 0;
    $('#arrCards').innerHTML = Object.entries(companies).map(([key, company], index) => {
      const value = Number(company.counter?.vLast || last(company.hist)?.[1] || 0);
      const yoy = company.yoyDen ? (value / company.yoyDen - 1) * 100 : 0;
      total += value;
      return metricCard(
        `${company.label} · ESTIMATED ARR`, `$${num(value,1)}B`,
        `<span class="${yoy >= 0 ? 'positive' : 'negative'}">${yoy >= 0 ? '+' : ''}${num(yoy,0)}% YoY</span>`,
        `检查点 ${num(last(company.cps)?.v || 0,0)}B`, index ? '#e8f2ee' : '#f7e8df'
      );
    }).join('');
    $('#tapeArr').textContent = `$${num(total,1)}B`;
    $('#tapeArrDelta').textContent = `截至 ${shortDate(D.arr?.updated)}`;

    const series = [];
    Object.entries(companies).forEach(([key, company], index) => {
      const color = company.color || COLORS[index];
      series.push(
        {name:company.label, type:'line', data:company.hist, showSymbol:false, smooth:.12, lineStyle:{width:2.4,color}, itemStyle:{color}},
        {name:`${company.label} 外推`, type:'line', data:company.ext, showSymbol:false, lineStyle:{width:2,type:'dashed',color}, itemStyle:{color}},
        {name:`${company.label} 检查点`, type:'scatter', symbol:'diamond', symbolSize:8, data:(company.cps || []).map(item => [item.t,item.v]), itemStyle:{color:'#fff',borderColor:color,borderWidth:2}, z:8}
      );
    });
    addChart('arrChart', {
      xAxis:{type:'time', axisLine:{lineStyle:{color:'#cfd7d3'}}, axisTick:{show:false}, axisLabel:{color:'#8290a0',fontSize:9}},
      yAxis:{type:'value', name:'USD billions', nameTextStyle:{color:'#9aa5b2',fontSize:9}, splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}, axisLabel:{color:'#8290a0',fontSize:9,formatter:'${value}B'}},
      tooltip:{trigger:'axis',backgroundColor:'rgba(16,33,55,.96)',borderWidth:0,textStyle:{color:'#fff',fontSize:10},valueFormatter:(value)=>`$${num(value,2)}B`},
      series
    });
  }

  function renderTokens() {
    const open = D.openrouter || {};
    const totals = open.daily_totals || [];
    const recent = totals.slice(-240);
    const latest = last(totals);
    $('#tapeTokens').textContent = latest ? `${num(latest[1],1)}B` : '—';
    $('#tapeTokenDate').textContent = latest ? `截至 ${shortDate(latest[0])}` : '—';
    $('#tokenLatest').textContent = shortDate(open.latest_date);
    $('#rankingDate').textContent = shortDate(open.latest_date);
    $('#sampleAlert').hidden = !open.sample;
    $('#tokenBadge').textContent = open.sample
      ? 'OpenRouter SAMPLE · Vercel · npm / PyPI'
      : 'OpenRouter Official Datasets API · SAMPLE = FALSE';

    addChart('tokenChart', {
      legend:{top:12,right:16,itemWidth:12,itemHeight:3,textStyle:{color:'#718094',fontSize:9}},
      xAxis:{type:'category',boundaryGap:false,data:recent.map(item=>item[0]),axisLabel:{formatter:(value)=>value.slice(5),color:'#8290a0',fontSize:9},axisLine:{lineStyle:{color:'#cfd7d3'}},axisTick:{show:false}},
      yAxis:{type:'value',name:'B/day',nameTextStyle:{color:'#9aa5b2',fontSize:9},axisLine:{show:false},axisLabel:{color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      series:[
        {name:'Daily',type:'line',data:recent.map(item=>item[1]),showSymbol:false,lineStyle:{width:1,color:'rgba(23,140,124,.28)'},areaStyle:{color:'rgba(23,140,124,.07)'}},
        {name:'7DMA',type:'line',data:movingAverage(recent).map(item=>item[1]),showSymbol:false,smooth:.15,lineStyle:{width:2.5,color:'#178c7c'},itemStyle:{color:'#178c7c'}}
      ]
    });

    const share = open.lab_share || {dates:[],labs:{}};
    const labEntries = Object.entries(share.labs || {}).sort((a,b)=>(last(b[1])||0)-(last(a[1])||0)).slice(0,8);
    addChart('labShareChart', {
      xAxis:{type:'category',boundaryGap:false,data:share.dates,axisLabel:{formatter:(value)=>value.slice(5),color:'#8290a0',fontSize:9},axisLine:{lineStyle:{color:'#cfd7d3'}},axisTick:{show:false}},
      yAxis:{type:'value',max:50,axisLabel:{formatter:'{value}%',color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      tooltip:{trigger:'axis',backgroundColor:'rgba(16,33,55,.96)',borderWidth:0,textStyle:{color:'#fff',fontSize:10},valueFormatter:(value)=>`${num(value,2)}%`},
      series:labEntries.map(([name, values], index)=>({name:LAB_NAMES[name]||name,type:'line',data:values,showSymbol:false,smooth:.13,lineStyle:{width:index<4?2:1.3,color:COLORS[index]},itemStyle:{color:COLORS[index]}}))
    });

    const watch = open.watchlist || {};
    const watchEntries = Object.entries(watch).filter(([,points])=>points?.length).slice(0,7);
    addChart('watchChart', {
      xAxis:{type:'time',axisLine:{lineStyle:{color:'#cfd7d3'}},axisTick:{show:false},axisLabel:{color:'#8290a0',fontSize:9}},
      yAxis:{type:'value',axisLabel:{color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      series:watchEntries.map(([name, points],index)=>({name:name.replace(/^.*\//,''),type:'line',data:points,showSymbol:false,smooth:.12,lineStyle:{width:index<3?2.2:1.4,color:COLORS[index]},itemStyle:{color:COLORS[index]}}))
    });

    const models = open.top_models_7d?.length ? open.top_models_7d : (open.top_models_latest || []);
    const max = Math.max(1,...models.map(item=>Number(item.tokens_b || 0)));
    $('#modelRows').innerHTML = models.slice(0,15).map((item,index)=>`<tr>
      <td class="rank">${String(index+1).padStart(2,'0')}</td>
      <td class="model-cell">${item.slug || item.model || '—'}<div class="mini-bar"><i style="width:${Number(item.tokens_b||0)/max*100}%"></i></div></td>
      <td class="num">${num(item.tokens_b,2)}B</td><td class="num">${num(Number(item.tokens_b||0)/max*100,0)}%</td>
    </tr>`).join('');
  }

  function renderVercel() {
    const vercel = D.vercel || {};
    const snapshot = last(vercel.snapshots || []) || {};
    $('#vercelDate1').textContent = shortDate(snapshot.date || vercel.as_of);
    $('#vercelDate2').textContent = shortDate(snapshot.date || vercel.as_of);
    const bar = (id, rows) => addChart(id, {
      grid:{left:145,right:42,top:18,bottom:28},
      xAxis:{type:'value',axisLabel:{formatter:'{value}%',color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      yAxis:{type:'category',data:(rows||[]).slice(0,10).map(item=>item[0]).reverse(),axisLabel:{color:'#657589',fontSize:9,width:130,overflow:'truncate'},axisLine:{show:false},axisTick:{show:false}},
      tooltip:{trigger:'item',backgroundColor:'rgba(16,33,55,.96)',borderWidth:0,textStyle:{color:'#fff',fontSize:10},valueFormatter:(value)=>`${num(value,2)}%`},
      series:[{type:'bar',barWidth:9,data:(rows||[]).slice(0,10).map((item,index)=>({value:item[1],itemStyle:{color:COLORS[index%COLORS.length],borderRadius:[0,4,4,0]}})).reverse(),label:{show:true,position:'right',color:'#718094',fontSize:8,formatter:'{c}%'}}]
    });
    bar('vercelTokenBar', snapshot.token_share);
    bar('vercelSpendBar', snapshot.spend_share);

    const cost = vercel.history?.cost || {};
    const entries = Object.entries(cost.labs || {}).sort((a,b)=>(last(b[1])||0)-(last(a[1])||0));
    addChart('vercelTrend', {
      grid:{left:44,right:18,top:48,bottom:34},
      xAxis:{type:'category',boundaryGap:false,data:cost.days || [],axisLabel:{formatter:(value)=>String(value).slice(5),color:'#8290a0',fontSize:9},axisLine:{lineStyle:{color:'#cfd7d3'}},axisTick:{show:false}},
      yAxis:{type:'value',axisLabel:{formatter:'{value}%',color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      tooltip:{trigger:'axis',backgroundColor:'rgba(16,33,55,.96)',borderWidth:0,textStyle:{color:'#fff',fontSize:10},valueFormatter:(value)=>`${num(value,2)}%`},
      series:entries.map(([name,values],index)=>({name:LAB_NAMES[name]||name,type:'line',data:values,showSymbol:false,smooth:.12,lineStyle:{width:2,color:COLORS[index]},itemStyle:{color:COLORS[index]}}))
    });
  }

  function renderSDK() {
    const sources = [
      ...Object.entries(D.sdk?.npm || {}).map(([name,points])=>[`npm · ${name}`,points]),
      ...Object.entries(D.sdk?.pypi || {}).map(([name,points])=>[`PyPI · ${name}`,points])
    ].filter(([,points])=>points?.length);
    const chosen = sources.sort((a,b)=>(last(b[1])?.[1]||0)-(last(a[1])?.[1]||0)).slice(0,6);
    addChart('sdkChart', {
      xAxis:{type:'time',axisLine:{lineStyle:{color:'#cfd7d3'}},axisTick:{show:false},axisLabel:{color:'#8290a0',fontSize:9}},
      yAxis:{type:'value',name:'M/day',nameTextStyle:{color:'#9aa5b2',fontSize:9},axisLabel:{color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      series:chosen.map(([name,points],index)=>({name,type:'line',data:movingAverage(points),showSymbol:false,smooth:.12,lineStyle:{width:index<3?2.2:1.4,color:COLORS[index]},itemStyle:{color:COLORS[index]}}))
    });
  }

  function pctChange(points, days) {
    if (!points?.length) return 0;
    const a = Number(last(points)?.[1] || 0);
    const b = Number(points[Math.max(0, points.length - 1 - days)]?.[1] || a);
    return b ? (a / b - 1) * 100 : 0;
  }

  function renderGPU() {
    const gpu = D.gpu || {};
    const entries = Object.entries(gpu.series || {});
    $('#gpuDate').textContent = shortDate(gpu.as_of);
    $('#gpuCards').innerHTML = entries.slice(0,5).map(([name,points],index)=>{
      const value = Number(last(points)?.[1] || 0);
      const change = pctChange(points,7);
      return metricCard(name, `$${num(value,2)}`, `<span class="${change>=0?'positive':'negative'}">7D ${change>=0?'+':''}${num(change,1)}%</span>`, '每 GPU 小时', ['#f7eddc','#f8e8df','#f5e4e3','#eceaf6','#e7f3f1'][index]);
    }).join('');
    const dates = [...new Set(entries.flatMap(([,points])=>points.map(item=>item[0])))].sort();
    addChart('gpuChart', {
      xAxis:{type:'category',boundaryGap:false,data:dates,axisLabel:{formatter:(value)=>String(value).slice(5),color:'#8290a0',fontSize:9},axisLine:{lineStyle:{color:'#cfd7d3'}},axisTick:{show:false}},
      yAxis:{type:'value',name:'$/GPU-hr',scale:true,nameTextStyle:{color:'#9aa5b2',fontSize:9},axisLabel:{color:'#8290a0',fontSize:9,formatter:'${value}'},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      series:entries.map(([name,points],index)=>{const map=new Map(points);return{name,type:'line',data:dates.map(date=>map.has(date)?map.get(date)[1]:null),showSymbol:false,smooth:.1,lineStyle:{width:2,color:COLORS[index]},itemStyle:{color:COLORS[index]}}})
    });
  }

  function renderDC() {
    const dc = D.datacenters || {};
    const t = dc.totals || {};
    $('#tapePower').textContent = `${num(t.it_power_gw,1)} GW`;
    $('#tapeSites').textContent = num(t.sites,0);
    $('#dcDate').textContent = shortDate(dc.as_of);
    $('#dcCards').innerHTML = [
      ['覆盖设施',num(t.sites,0),'sites','卫星 + permit 样本','#e8f2ee'],
      ['IT Power',`${num(t.it_power_gw,1)} GW`,'covered sample','总设施功耗通常更高','#e8eef5'],
      ['H100 等效',`${num(t.h100_eq_m,1)}M`,'H100-eq','跨代芯片折算','#f6eadf']
    ].map(item=>metricCard(item[0],item[1],item[3],item[2],item[4])).join('');

    const timeline = dc.industry_timeline || [];
    addChart('dcTimeline', {
      xAxis:{type:'category',data:timeline.map(item=>item[0]),axisLabel:{color:'#8290a0',fontSize:9,interval:'auto'},axisLine:{lineStyle:{color:'#cfd7d3'}},axisTick:{show:false}},
      yAxis:[
        {type:'value',name:'MW',nameTextStyle:{color:'#9aa5b2',fontSize:9},axisLabel:{color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
        {type:'value',name:'k H100-eq',nameTextStyle:{color:'#9aa5b2',fontSize:9},axisLabel:{color:'#8290a0',fontSize:9},splitLine:{show:false}}
      ],
      series:[
        {name:'IT Power',type:'bar',barWidth:'55%',data:timeline.map(item=>Number(item[1])),itemStyle:{color:'rgba(57,120,169,.22)',borderColor:'#3978a9',borderWidth:.5,borderRadius:[3,3,0,0]}},
        {name:'H100 等效',type:'line',yAxisIndex:1,data:timeline.map(item=>Number(item[2])),showSymbol:false,lineStyle:{width:2.4,color:'#e36f3d'},itemStyle:{color:'#e36f3d'}}
      ]
    });

    const owners = dc.by_owner || [];
    addChart('ownerChart', {
      grid:{left:135,right:34,top:20,bottom:30},
      xAxis:{type:'value',axisLabel:{color:'#8290a0',fontSize:9},splitLine:{lineStyle:{color:'#e8ece9',type:'dashed'}}},
      yAxis:{type:'category',data:owners.map(item=>item.owner).reverse(),axisLine:{show:false},axisTick:{show:false},axisLabel:{color:'#657589',fontSize:9,width:120,overflow:'truncate'}},
      tooltip:{trigger:'item',backgroundColor:'rgba(16,33,55,.96)',borderWidth:0,textStyle:{color:'#fff',fontSize:10},valueFormatter:(value)=>`${num(value,0)} MW`},
      series:[{type:'bar',barWidth:10,data:owners.map((item,index)=>({value:item.mw,itemStyle:{color:COLORS[index%COLORS.length],borderRadius:[0,4,4,0]}})).reverse()}]
    });

    $('#siteRows').innerHTML = (dc.top_sites || []).slice(0,15).map(site=>`<tr>
      <td>${site.name || '—'}</td><td>${site.owner || '—'}</td><td>${site.user || '—'}</td><td>${site.location || '—'}</td>
      <td class="num">${num(site.mw,0)} MW</td><td class="num">${num(site.h100e_k,0)}k</td>
    </tr>`).join('');
  }

  function renderSignals() {
    const signals = D.signals || {};
    $('#signalGrid').innerHTML = (signals.kol || []).map(item=>`<article class="signal-card">
      <div class="signal-meta">${item.date || '—'} · ${item.who || '—'}</div>
      <h3>${item.via || ''}</h3><p>${item.take || ''}</p>
      ${item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">查看来源 ↗</a>` : ''}
    </article>`).join('');
    $('#newsDate').textContent = shortDate(D.news?.as_of);
    $('#newsRows').innerHTML = (D.news?.items || []).map(item=>`<tr>
      <td class="rank">${item.date || '—'}</td><td>${item.news_source || item.source || '—'}</td>
      <td><a href="${item.url || '#'}" target="_blank" rel="noreferrer">${item.title || '—'}</a></td>
    </tr>`).join('');
  }

  renderQuality();
  renderArr();
  renderTokens();
  renderVercel();
  renderSDK();
  renderGPU();
  renderDC();
  renderSignals();

  const densityButton = $('#themeDensity');
  densityButton.addEventListener('click', () => {
    document.body.classList.toggle('compact');
    densityButton.textContent = document.body.classList.contains('compact') ? '舒展视图' : '紧凑视图';
    setTimeout(() => instances.forEach((instance) => instance.resize()), 80);
  });
})();

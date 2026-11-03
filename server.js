const express=require('express'), http=require('http'), {Server}=require('socket.io');
const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.static('public'));
const rooms=new Map(), COLORS=['red','yellow','green','blue'];
const uid=()=>Math.random().toString(36).slice(2,10).toUpperCase();
function shuffle(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeDeck(){let d=[]; for(const c of COLORS){d.push({id:uid(),type:'number',value:0,color:c,flip:false});for(let n=1;n<=9;n++)for(let k=0;k<2;k++)d.push({id:uid(),type:'number',value:n,color:c,flip:Math.random()<.16});for(const t of ['skip','reverse','draw2'])for(let k=0;k<2;k++)d.push({id:uid(),type:t,color:c,flip:false});}
 // Flex action cards: each color has one of each; they retain a regular and flex effect.
 for(const c of COLORS) for(const t of ['flexSkip','flexReverse','flexDraw2']) d.push({id:uid(),type:t,color:c,flexColor:COLORS[(COLORS.indexOf(c)+1)%4]});
 for(let k=0;k<4;k++) d.push({id:uid(),type:'wildFlip',color:null});
 for(let k=0;k<4;k++) d.push({id:uid(),type:'flexWildTarget2',color:null});
 for(let k=0;k<4;k++) d.push({id:uid(),type:'flexWildAllDraw',color:null});
 for(let k=0;k<4;k++) d.push({id:uid(),type:'flexWildDraw4',color:null});
 // Eight separate player power cards are not part of the draw pile.
 return shuffle(d).slice(0,104);}
function publicState(r){return {code:r.code,players:r.players.map(p=>({id:p.id,name:p.name,count:p.hand.length,power:p.power,uno:p.uno})),top:r.discard.at(-1),discardCount:r.discard.length,drawCount:r.deck.length,turn:r.players[r.turn]?.id,direction:r.direction,activeColor:r.activeColor,status:r.status,winner:r.winner,log:r.log.slice(-8)};}
function emit(r){for(const p of r.players){io.to(p.id).emit('state',{...publicState(r),you:p.id,hand:p.hand});}}
function next(r,n=1){r.turn=(r.turn+r.direction*n+r.players.length*10)%r.players.length;}
function draw(r,p,n=1){for(let i=0;i<n;i++){if(!r.deck.length){if(r.discard.length>1){let top=r.discard.pop();r.deck=shuffle(r.discard);r.discard=[top];}else break;}if(r.deck.length)p.hand.push(r.deck.pop());}}
function log(r,s){r.log.push(s);}
function valid(r,card,flex){let top=r.discard.at(-1);if(card.type.startsWith('flexWild')||card.type==='wildFlip')return true;let chosen=flex?card.flexColor:card.color;if(card.type==='number')return chosen===r.activeColor||card.value===top.value|| (top.type!=='number'&&chosen===r.activeColor);return chosen===r.activeColor||card.type===top.type;}
function start(r){r.deck=makeDeck();r.players.forEach(p=>{p.hand=[];p.power=true;p.uno=false;for(let i=0;i<7;i++)p.hand.push(r.deck.pop());});let first=r.deck.pop();while(['skip','reverse','draw2','flexSkip','flexReverse','flexDraw2'].includes(first.type)){r.deck.unshift(first);first=r.deck.pop();}r.discard=[first];r.activeColor=first.color||COLORS[0];r.turn=0;r.direction=1;r.status='playing';r.winner=null;r.log=['Trận đấu bắt đầu!'];}
function finishOrAdvance(r,p,card,mode,opts={}){let idx=r.players.indexOf(p), n=r.players.length;const target=(offset)=>r.players[(idx+r.direction*offset+n*10)%n];
 if(card.type==='number'&&card.flip)p.power=!p.power;
 if(card.type==='wildFlip'){r.players.forEach(x=>x.power=!x.power);r.activeColor=opts.color;}
 if(card.type.startsWith('flexWild'))r.activeColor=opts.color;
 if(card.type==='flexWildTarget2'&&mode==='flex'){let t=r.players.find(x=>x.id===opts.target);if(t)draw(r,t,2);}
 if(card.type==='flexWildAllDraw'&&mode==='flex')r.players.filter(x=>x!==p).forEach(x=>draw(r,x,2));
 if(card.type==='flexWildDraw4'){if(mode==='flex'){let t=r.players.find(x=>x.id===opts.target);if(t)draw(r,t,4);}else {draw(r,target(1),4);next(r,2);}}
 if(card.type==='flexDraw2'){if(mode==='flex')r.players.filter(x=>x!==p).forEach(x=>draw(r,x,1));else {draw(r,target(1),2);next(r,2);}}
 else if(card.type==='draw2'){draw(r,target(1),2);next(r,2);}
 if(card.type==='skip')next(r,2);
 if(card.type==='flexSkip'){if(mode==='flex'){/* skip all opponents: same player plays again */}else next(r,2);}
 if(card.type==='reverse'||card.type==='flexReverse'){r.direction*=-1;if(card.type==='flexReverse'&&mode==='flex')next(r,2);else if(n===2)next(r,2);}
 if(p.hand.length===0){r.status='finished';r.winner=p.id;log(r,p.name+' đã chiến thắng!');return;}
 if(p.hand.length===1&&!p.uno)log(r,p.name+' còn 1 lá — nhớ bấm UNO!');
 if(!(card.type==='flexSkip'&&mode==='flex'))next(r,1);
}
io.on('connection',s=>{
 s.on('createRoom',({name})=>{let code=uid().slice(0,5),p={id:s.id,name:(name||'Người chơi').slice(0,18),hand:[],power:true,uno:false};let r={code,players:[p],status:'lobby',log:['Phòng đã được tạo.'],direction:1,turn:0,deck:[],discard:[],activeColor:null};rooms.set(code,r);s.join(code);s.emit('joined',{code});emit(r);});
 s.on('joinRoom',({code,name})=>{let r=rooms.get((code||'').toUpperCase());if(!r)return s.emit('errorMsg','Không tìm thấy phòng.');if(r.status!=='lobby'||r.players.length>=8)return s.emit('errorMsg','Phòng đã bắt đầu hoặc đủ 8 người.');if(r.players.some(p=>p.id===s.id))return; r.players.push({id:s.id,name:(name||'Người chơi').slice(0,18),hand:[],power:true,uno:false});s.join(r.code);s.emit('joined',{code:r.code});log(r,(name||'Người chơi')+' đã vào phòng.');emit(r);});
 s.on('startGame',()=>{let r=[...rooms.values()].find(x=>x.players.some(p=>p.id===s.id));if(!r||r.players[0].id!==s.id||r.players.length<2)return s.emit('errorMsg','Cần ít nhất 2 người và chủ phòng mới được bắt đầu.');start(r);emit(r);});
 s.on('playCard',({cardId,mode='regular',color,target})=>{let r=[...rooms.values()].find(x=>x.players.some(p=>p.id===s.id));if(!r||r.status!=='playing')return;let p=r.players.find(x=>x.id===s.id);if(r.players[r.turn]!==p)return s.emit('errorMsg','Chưa đến lượt bạn.');let i=p.hand.findIndex(c=>c.id===cardId);if(i<0)return;let c=p.hand[i];if(mode==='flex'&&!p.power)return s.emit('errorMsg','Power đang ở dấu X, chưa thể dùng mặt Flex.');if(!valid(r,c,mode==='flex'))return s.emit('errorMsg','Lá bài không hợp lệ.');if((c.type.startsWith('flexWild')||c.type==='wildFlip')&&!COLORS.includes(color))return s.emit('errorMsg','Hãy chọn màu.');if(c.type==='flexWildTarget2'||(c.type==='flexWildDraw4'&&mode==='flex'))if(!r.players.some(x=>x.id===target&&x.id!==p.id))return s.emit('errorMsg','Hãy chọn người chơi mục tiêu.');p.hand.splice(i,1);r.discard.push(c);if(mode==='flex')p.power=false;log(r,p.name+' đánh '+(mode==='flex'?'mặt Flex ':'')+c.type);finishOrAdvance(r,p,c,mode,{color,target});if(r.players.every(x=>!x.power))r.players.forEach(x=>x.power=true);emit(r);});
 s.on('drawCard',()=>{let r=[...rooms.values()].find(x=>x.players.some(p=>p.id===s.id));if(!r||r.status!=='playing'||r.players[r.turn].id!==s.id)return;let p=r.players.find(x=>x.id===s.id);draw(r,p,1);log(r,p.name+' rút 1 lá.');next(r);emit(r);});
 s.on('callUno',()=>{let r=[...rooms.values()].find(x=>x.players.some(p=>p.id===s.id));let p=r?.players.find(x=>x.id===s.id);if(p&&p.hand.length===1){p.uno=true;log(r,p.name+' đã hô UNO!');emit(r);}});
 s.on('disconnect',()=>{for(const r of rooms.values()){let i=r.players.findIndex(p=>p.id===s.id);if(i>=0){r.players.splice(i,1);if(!r.players.length)rooms.delete(r.code);else{if(r.turn>=r.players.length)r.turn=0;log(r,'Một người chơi đã thoát.');emit(r);}}}});
});
const PORT=process.env.PORT||3000;server.listen(PORT,()=>console.log('UNO Flex Online running on '+PORT));

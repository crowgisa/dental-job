// ════════════════════════════════════════════════════════
//  덴탈잡 — Firebase 완전 연동 버전 (파일업로드 제외)
//
//  설치: npm install firebase
//  필요: src/firebase.js 에 firebaseConfig 입력
//
//  Firebase 활성화 항목:
//    - Firestore Database (테스트 모드)
//    - Authentication (익명 로그인)
// ════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { db, auth } from "./firebase";

// ── 색상 & 카테고리 ────────────────────────────────────
const COLORS = {
  primary: "#0A5C8A", secondary: "#00B4D8", bg: "#F0F8FF",
  text: "#0D1B2A", muted: "#5E7D9A", success: "#2DC653",
  warning: "#F4A261", danger: "#E63946",
  dentist: "#1B4FCA", hygienist: "#0E9E6E", technician: "#7B2FBE",
};
const CATS = [
  { id:"dentist",    label:"치과의사",   color:COLORS.dentist,    icon:"🦷" },
  { id:"hygienist",  label:"치과위생사", color:COLORS.hygienist,  icon:"🩺" },
  { id:"technician", label:"치과기공사", color:COLORS.technician, icon:"⚙️" },
];
const gc  = (cat) => CATS.find(c=>c.id===cat)?.color || COLORS.primary;
const gi  = (cat) => CATS.find(c=>c.id===cat)?.icon  || "🦷";
const gl  = (cat) => CATS.find(c=>c.id===cat)?.label || cat;
const tl  = (f)   => f==="cad"?"⚙️ CAD-CAM":f==="denture"?"🦷 Denture":"🔩 일반보철";
const fmt = (p)   => p.salary ? `💰 ${p.salaryType} ${Number(p.salary).toLocaleString()}원` : "";

const S = {
  label: { display:"block", fontSize:12, fontWeight:700, color:"#334155", marginBottom:5 },
  input: { width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid #e2e8f0",
           fontSize:13, outline:"none", fontFamily:"'Noto Sans KR',sans-serif",
           background:"white", marginBottom:10 },
};

// ── 공통 컴포넌트 ──────────────────────────────────────
function Toggle({ on, onToggle, color }) {
  return (
    <div onClick={onToggle} style={{ width:48, height:26,
        background:on?(color||COLORS.success):"#ddd", borderRadius:13,
        position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
      <div style={{ position:"absolute", top:3, left:on?24:3, width:20, height:20,
          background:"white", borderRadius:"50%", transition:"left 0.2s",
          boxShadow:"0 1px 4px rgba(0,0,0,0.2)" }} />
    </div>
  );
}
function Badge({ text, bg, color }) {
  return <span style={{ background:bg, color, borderRadius:6, padding:"2px 8px",
                        fontSize:11, fontWeight:700, flexShrink:0 }}>{text}</span>;
}
function Toast({ msg, color }) {
  return (
    <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)",
        background:color, color:"white", padding:"10px 20px", borderRadius:30,
        fontSize:13, fontWeight:700, zIndex:9999,
        boxShadow:"0 4px 16px rgba(0,0,0,0.2)", whiteSpace:"nowrap", maxWidth:"90vw" }}>
      {msg}
    </div>
  );
}
function Loader() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", padding:"40px 0", gap:10, color:COLORS.muted }}>
      <div style={{ fontSize:36 }}>🦷</div>
      <div style={{ fontSize:13, fontWeight:600 }}>불러오는 중...</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  메인 앱
// ════════════════════════════════════════════════════════
export default function App() {
  // 인증
  const [authReady,    setAuthReady]    = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);

  // 화면
  const [screen,       setScreen]       = useState("splash");
  const [user,         setUser]         = useState(null);
  const [tab,          setTab]          = useState("home");

  // 데이터
  const [posts,        setPosts]        = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [notifs,       setNotifs]       = useState([]);
  const [unread,       setUnread]       = useState(0);

  // UI
  const [showNotif,    setShowNotif]    = useState(false);
  const [selPost,      setSelPost]      = useState(null);
  const [showWrite,    setShowWrite]    = useState(false);
  const [showContact,  setShowContact]  = useState(null);
  const [editPost,     setEditPost]     = useState(null);

  // 즐겨찾기 & 최근본 (Firestore 저장)
  const [bookmarks,    setBookmarks]    = useState([]);
  const [recentViewed, setRecentViewed] = useState([]);

  // 필터
  const [catFilter,    setCatFilter]    = useState("all");
  const [ptFilter,     setPtFilter]     = useState("all");

  // Toast
  const [toast,        setToast]        = useState(null);
  const [toastColor,   setToastColor]   = useState(COLORS.success);

  // 폼
  const [loginForm, setLoginForm] = useState({ name:"", role:"구직자", category:"dentist" });
  const [writeForm, setWriteForm] = useState({
    type:"구인", category:"dentist", isParttime:false,
    title:"", description:"", location:"",
    salaryType:"연봉", salary:"", techField:"", contact:"",
  });

  // 알림 설정
  const [notifCfg, setNotifCfg] = useState({
    enabled:true,
    cats:{ dentist:true, hygienist:true, technician:true },
    emp:{ fulltime:true, parttime:true },
    tech:{ cad:true, denture:true, prosthetics:true },
  });

  // ── Toast ──
  const showToast = useCallback((msg, color=COLORS.success) => {
    setToast(msg); setToastColor(color);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ── 1. Firebase 익명 인증 ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) { setFirebaseUser(fbUser); setAuthReady(true); }
      else { try { await signInAnonymously(auth); } catch(e) {} }
    });
    return () => unsub();
  }, []);

  // ── 2. 자동 로그인 ──
  useEffect(() => {
    if (!authReady) return;
    try {
      const saved = localStorage.getItem("dj_user");
      if (saved) { setUser(JSON.parse(saved)); setScreen("main"); return; }
    } catch(e) {}
    const t = setTimeout(() => setScreen("login"), 1800);
    return () => clearTimeout(t);
  }, [authReady]);

  // ── 3. 즐겨찾기·최근본·알림설정 Firestore 구독 ──
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const unsub = onSnapshot(doc(db, "userdata", firebaseUser.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setBookmarks(d.bookmarks || []);
        setRecentViewed(d.recentViewed || []);
        if (d.notifCfg) setNotifCfg(d.notifCfg);
      }
    });
    return () => unsub();
  }, [authReady, firebaseUser]);

  // ── 4. 공고 실시간 구독 ──
  useEffect(() => {
    if (!authReady) return;
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setPostsLoading(false);
    }, () => setPostsLoading(false));
    return () => unsub();
  }, [authReady]);

  // ── 5. 알림 실시간 구독 ──
  useEffect(() => {
    if (!authReady) return;
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      setNotifs(data);
      setUnread(data.filter(n=>!n.read).length);
    });
    return () => unsub();
  }, [authReady]);

  // ── userdata 저장 ──
  const saveUserData = useCallback(async (updates) => {
    if (!firebaseUser) return;
    try { await setDoc(doc(db, "userdata", firebaseUser.uid), updates, { merge:true }); }
    catch(e) { console.error(e); }
  }, [firebaseUser]);

  // ── 로그인 ──
  const handleLogin = () => {
    if (!loginForm.name) { showToast("이름을 입력해주세요", COLORS.danger); return; }
    const u = { ...loginForm, uid: firebaseUser?.uid };
    try { localStorage.setItem("dj_user", JSON.stringify(u)); } catch(e) {}
    setUser(u); setScreen("main");
    showToast(`환영합니다, ${u.name}님! 🦷`);
  };

  // ── 즐겨찾기 토글 ──
  const toggleBookmark = useCallback(async (postId) => {
    const next = bookmarks.includes(postId)
      ? bookmarks.filter(x=>x!==postId)
      : [...bookmarks, postId];
    setBookmarks(next);
    await saveUserData({ bookmarks: next });
  }, [bookmarks, saveUserData]);

  // ── 공고 조회 (조회수 + 최근본 Firestore 저장) ──
  const viewPost = useCallback(async (post) => {
    const newViews = (post.views||0) + 1;
    try { await updateDoc(doc(db,"posts",post.id), { views:newViews }); } catch(e) {}
    const nextRecent = [
      { id:post.id, title:post.title, category:post.category, location:post.location },
      ...recentViewed.filter(p=>p.id!==post.id)
    ].slice(0,10);
    setRecentViewed(nextRecent);
    await saveUserData({ recentViewed: nextRecent });
    setSelPost({ ...post, views:newViews });
  }, [recentViewed, saveUserData]);

  // ── 공고 등록 ──
  const handleWrite = async () => {
    if (!writeForm.title)   { showToast("제목을 입력해주세요",   COLORS.danger); return; }
    if (!writeForm.salary)  { showToast("급여를 입력해주세요",   COLORS.danger); return; }
    if (!writeForm.contact) { showToast("연락처를 입력해주세요", COLORS.danger); return; }
    try {
      await addDoc(collection(db,"posts"), {
        ...writeForm,
        authorId:   user.name,
        authorUid:  firebaseUser?.uid,
        name:       writeForm.type==="구직" ? user.name : null,
        hospital:   writeForm.type==="구인" ? (writeForm.hospital||"미기재") : null,
        applicants: 0, views:0, closed:false,
        createdAt:  serverTimestamp(),
      });
      await addDoc(collection(db,"notifications"), {
        text:      `새 ${writeForm.type} 공고: ${writeForm.title}`,
        category:  writeForm.category,
        time:      "방금 전",
        read:      false,
        createdAt: serverTimestamp(),
      });
      setShowWrite(false);
      setWriteForm({ type:"구인", category:"dentist", isParttime:false, title:"", description:"", location:"", salaryType:"연봉", salary:"", techField:"", contact:"" });
      showToast("공고가 등록되었습니다! 🎉");
    } catch(e) { showToast("등록 실패. 다시 시도해주세요", COLORS.danger); }
  };

  // ── 공고 수정 ──
  const handleSaveEdit = async () => {
    if (!editPost.title) { showToast("제목을 입력해주세요", COLORS.danger); return; }
    try {
      const { id, createdAt, ...rest } = editPost;
      await updateDoc(doc(db,"posts",id), { ...rest, updatedAt:serverTimestamp() });
      setEditPost(null); showToast("수정되었습니다 ✅");
    } catch(e) { showToast("수정 실패", COLORS.danger); }
  };

  // ── 공고 삭제 ──
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db,"posts",id));
      setSelPost(null); showToast("삭제되었습니다");
    } catch(e) { showToast("삭제 실패", COLORS.danger); }
  };

  // ── 마감 토글 ──
  const handleToggleClose = async (id, current) => {
    try {
      await updateDoc(doc(db,"posts",id), { closed:!current });
      setSelPost(prev => prev ? { ...prev, closed:!current } : null);
    } catch(e) { showToast("처리 실패", COLORS.danger); }
  };

  // ── 알림 설정 저장 ──
  const updateNotifCfg = async (newCfg) => {
    setNotifCfg(newCfg);
    await saveUserData({ notifCfg: newCfg });
  };

  const filtered = posts.filter(p => {
    if (catFilter!=="all" && p.category!==catFilter) return false;
    if (ptFilter==="fulltime" && p.isParttime) return false;
    if (ptFilter==="parttime" && !p.isParttime) return false;
    return true;
  });
  const myName = user?.name || "";

  // ══ SPLASH ══
  if (screen==="splash") return (
    <div style={{ position:"fixed", inset:0, background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        fontFamily:"'Noto Sans KR',sans-serif" }}>
      <div style={{ fontSize:72 }}>🦷</div>
      <div style={{ color:"white", fontSize:28, fontWeight:900, marginTop:16 }}>덴탈잡</div>
      <div style={{ color:"rgba(255,255,255,0.8)", fontSize:13, marginTop:6 }}>치과계열 전문 구인구직 플랫폼</div>
      <div style={{ marginTop:32, display:"flex", gap:8 }}>
        {[0,1,2].map(i=><div key={i} style={{ width:8, height:8, borderRadius:"50%", background:i===0?"white":"rgba(255,255,255,0.4)" }}/>)}
      </div>
    </div>
  );

  // ══ LOGIN ══
  if (screen==="login") return (
    <div style={{ position:"fixed", inset:0, background:COLORS.bg,
        fontFamily:"'Noto Sans KR',sans-serif", display:"flex", flexDirection:"column",
        overflowY:"auto" }}>
      <div style={{ background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`, padding:"40px 24px 28px", color:"white", textAlign:"center" }}>
        <div style={{ fontSize:44 }}>🦷</div>
        <div style={{ fontSize:24, fontWeight:900, marginTop:8 }}>덴탈잡</div>
        <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>치과계열 전문 구인구직 플랫폼</div>
      </div>
      <div style={{ flex:1, padding:"24px 20px" }}>
        <div style={{ fontSize:16, fontWeight:700, color:COLORS.text, marginBottom:16 }}>간편 회원가입 / 로그인</div>
        <label style={S.label}>이름 *</label>
        <input style={S.input} placeholder="홍길동" value={loginForm.name}
               onChange={e=>setLoginForm({...loginForm,name:e.target.value})} />
        <label style={S.label}>나는</label>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          {["구직자","구인자"].map(r=>(
            <button key={r} onClick={()=>setLoginForm({...loginForm,role:r})}
              style={{ flex:1, padding:"9px 0", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14,
                border:`2px solid ${loginForm.role===r?COLORS.primary:"#ddd"}`,
                background:loginForm.role===r?COLORS.primary:"white",
                color:loginForm.role===r?"white":COLORS.muted }}>
              {r==="구직자"?"👤 구직자":"🏥 구인자"}
            </button>
          ))}
        </div>
        <label style={S.label}>직종</label>
        <div style={{ display:"flex", gap:8, marginBottom:22, flexWrap:"wrap" }}>
          {CATS.map(c=>(
            <button key={c.id} onClick={()=>setLoginForm({...loginForm,category:c.id})}
              style={{ padding:"7px 12px", borderRadius:20, cursor:"pointer", fontWeight:600, fontSize:12,
                border:`2px solid ${loginForm.category===c.id?c.color:"#ddd"}`,
                background:loginForm.category===c.id?c.color:"white",
                color:loginForm.category===c.id?"white":COLORS.muted }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <button onClick={handleLogin}
          style={{ width:"100%", padding:"14px 0",
            background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
            color:"white", border:"none", borderRadius:14, fontSize:15, fontWeight:800, cursor:"pointer" }}>
          시작하기 →
        </button>
        <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:COLORS.muted }}>
          이름과 직종 선택만으로 간편하게 시작하세요
        </div>
      </div>
      {toast && <Toast msg={toast} color={toastColor} />}
    </div>
  );

  // ══ MAIN ══
  return (
    <div style={{ position:"fixed", inset:0, background:COLORS.bg,
        fontFamily:"'Noto Sans KR',sans-serif",
        display:"flex", flexDirection:"column",
        maxWidth:480, margin:"0 auto" }}>

      {/* 헤더 */}
      <div style={{ background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
          padding:"12px 18px 10px", display:"flex", alignItems:"center",
          justifyContent:"space-between", flexShrink:0,
          boxShadow:"0 2px 8px rgba(0,0,0,0.12)", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:20 }}>🦷</span>
          <span style={{ color:"white", fontWeight:900, fontSize:18 }}>덴탈잡</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ position:"relative", cursor:"pointer" }}
               onClick={()=>{ setShowNotif(!showNotif); setUnread(0); }}>
            <span style={{ fontSize:22 }}>🔔</span>
            {unread>0 && (
              <div style={{ position:"absolute", top:-3, right:-3, background:COLORS.danger,
                  color:"white", borderRadius:"50%", width:16, height:16,
                  fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {unread}
              </div>
            )}
          </div>
          <span style={{ color:"white", fontSize:12, fontWeight:600 }}>{myName}님</span>
        </div>
      </div>

      {/* 알림 패널 */}
      {showNotif && (
        <div style={{ position:"fixed", top:50, left:0, right:0, maxWidth:480, margin:"0 auto",
            background:"white", zIndex:200, boxShadow:"0 8px 24px rgba(0,0,0,0.12)",
            borderRadius:"0 0 14px 14px", maxHeight:240, overflowY:"auto" }}>
          <div style={{ padding:"9px 16px", borderBottom:"1px solid #f0f0f0",
              fontWeight:700, fontSize:13, color:COLORS.text }}>📱 앱 알림</div>
          {notifs.length===0 && <div style={{ padding:16, fontSize:13, color:COLORS.muted, textAlign:"center" }}>알림이 없습니다</div>}
          {notifs.map(n=>(
            <div key={n.id} style={{ padding:"9px 16px", borderBottom:"1px solid #f8f8f8",
                background:n.read?"white":"#EFF8FF", display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:COLORS.text }}>{!n.read&&"🔵 "}{n.text}</span>
              <span style={{ fontSize:11, color:COLORS.muted, marginLeft:8, whiteSpace:"nowrap" }}>{n.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* 콘텐츠 */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden",
          padding:"13px", paddingBottom:"calc(120px + env(safe-area-inset-bottom))",
          WebkitOverflowScrolling:"touch" }}
           onClick={()=>showNotif&&setShowNotif(false)}>

        {/* ══ HOME ══ */}
        {tab==="home" && (
          <>
            <div style={{ background:`linear-gradient(135deg,${gc(user?.category)}22,${gc(user?.category)}44)`,
                border:`1.5px solid ${gc(user?.category)}44`, borderRadius:14,
                padding:"12px 16px", marginBottom:13,
                display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:COLORS.text }}>
                  {gi(user?.category)} {gl(user?.category)} · {user?.role}
                </div>
                <div style={{ fontSize:11, color:COLORS.muted, marginTop:2 }}>
                  {user?.role==="구직자"?"새 구인공고 알림 수신 중 🔔":"새 구직자 알림 수신 중 🔔"}
                </div>
              </div>
              <span style={{ fontSize:26 }}>🦷</span>
            </div>

            {/* 직종 필터 */}
            <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4, marginBottom:8 }}>
              {CATS.map(c=>(
                <button key={c.id} onClick={()=>setCatFilter(catFilter===c.id?"all":c.id)}
                  style={{ padding:"6px 12px", borderRadius:20, cursor:"pointer", fontWeight:600,
                    fontSize:12, whiteSpace:"nowrap",
                    border:`1.5px solid ${catFilter===c.id?c.color:"#ddd"}`,
                    background:catFilter===c.id?c.color:"white",
                    color:catFilter===c.id?"white":COLORS.muted }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            {/* 고용형태 필터 */}
            <div style={{ display:"flex", gap:6, marginBottom:12 }}>
              {[["fulltime","📋 정규직"],["parttime","⏰ 알바"]].map(([v,l])=>(
                <button key={v} onClick={()=>setPtFilter(ptFilter===v?"all":v)}
                  style={{ padding:"5px 13px", borderRadius:20, cursor:"pointer", fontWeight:600, fontSize:12,
                    border:`1.5px solid ${ptFilter===v?COLORS.warning:"#ddd"}`,
                    background:ptFilter===v?COLORS.warning:"white",
                    color:ptFilter===v?"white":COLORS.muted }}>
                  {l}
                </button>
              ))}
            </div>

            {/* 공고 목록 */}
            {postsLoading && <Loader />}
            {!postsLoading && filtered.length===0 && (
              <div style={{ textAlign:"center", padding:"40px 0", color:COLORS.muted }}>게시글이 없습니다</div>
            )}
            {!postsLoading && filtered.map(post=>{
              const bm=bookmarks.includes(post.id);
              return (
                <div key={post.id} onClick={()=>viewPost(post)}
                  style={{ background:"white", borderRadius:14, padding:13,
                    boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
                    border:`1.5px solid ${post.closed?"#ddd":gc(post.category)+"22"}`,
                    cursor:"pointer", marginBottom:10, position:"relative", opacity:post.closed?0.7:1 }}>
                  {post.closed && (
                    <span style={{ position:"absolute", top:9, right:9, background:"#888",
                        color:"white", borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:700 }}>
                      {post.type==="구직"?"구직완료":"구인완료"}
                    </span>
                  )}
                  <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap", paddingRight:post.closed?60:0 }}>
                    <Badge text={post.type} bg={post.type==="구인"?COLORS.primary:COLORS.success} color="white" />
                    <Badge text={`${gi(post.category)} ${gl(post.category)}`} bg={gc(post.category)+"22"} color={gc(post.category)} />
                    {post.isParttime && <Badge text="알바" bg={COLORS.warning+"22"} color={COLORS.warning} />}
                    {post.techField  && <Badge text={tl(post.techField)} bg={COLORS.technician+"18"} color={COLORS.technician} />}
                  </div>
                  <div style={{ fontWeight:700, fontSize:14, color:COLORS.text, marginBottom:4 }}>{post.title}</div>
                  <div style={{ fontSize:12, color:COLORS.muted, display:"flex", gap:10, flexWrap:"wrap" }}>
                    <span>📍 {post.location}</span>
                    {post.salary && <span>{fmt(post)}</span>}
                  </div>
                  <div style={{ fontSize:11, color:COLORS.muted, marginTop:8,
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ display:"flex", gap:8 }}>
                      <span>{post.createdAt?.toDate?.()?.toLocaleDateString("ko-KR")||""}</span>
                      {post.views>0 && <span>👁 {post.views}</span>}
                    </span>
                    <span style={{ display:"flex", gap:8, alignItems:"center" }}>
                      {post.type==="구인" && <span style={{ color:COLORS.secondary, fontWeight:600 }}>지원자 {post.applicants}명</span>}
                      <span onClick={e=>{e.stopPropagation();toggleBookmark(post.id);}}
                            style={{ fontSize:16, cursor:"pointer" }}>
                        {bm?"⭐":"☆"}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ PROFILE ══ */}
        {tab==="profile" && (
          <div>
            <div style={{ background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
                borderRadius:16, padding:"22px 20px", color:"white", textAlign:"center", marginBottom:13 }}>
              <div style={{ fontSize:42 }}>{gi(user?.category)}</div>
              <div style={{ fontSize:18, fontWeight:900, marginTop:8 }}>{user?.name}</div>
              <div style={{ fontSize:12, opacity:0.9, marginTop:4 }}>{gl(user?.category)} · {user?.role}</div>
            </div>

            {/* 알림 설정 */}
            <div style={{ background:"white", borderRadius:14, padding:"14px 16px",
                boxShadow:"0 2px 8px rgba(0,0,0,0.06)", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  marginBottom:notifCfg.enabled?12:0 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COLORS.text }}>🔔 앱 푸시 알림</div>
                <Toggle on={notifCfg.enabled} onToggle={()=>updateNotifCfg({...notifCfg,enabled:!notifCfg.enabled})} />
              </div>
              {notifCfg.enabled && (
                <>
                  <div style={{ fontSize:11, fontWeight:700, color:COLORS.muted, marginBottom:8 }}>알림 받을 직종</div>
                  {CATS.map(c=>(
                    <div key={c.id} style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"center", padding:"7px 0", borderTop:"1px solid #f5f5f5" }}>
                      <span style={{ fontSize:13, color:COLORS.text }}>{c.icon} {c.label}</span>
                      <Toggle on={notifCfg.cats[c.id]} color={c.color}
                        onToggle={()=>updateNotifCfg({...notifCfg,cats:{...notifCfg.cats,[c.id]:!notifCfg.cats[c.id]}})} />
                    </div>
                  ))}
                  <div style={{ fontSize:11, fontWeight:700, color:COLORS.muted, margin:"10px 0 8px" }}>고용 형태</div>
                  {[["fulltime","📋 정규직"],["parttime","⏰ 알바"]].map(([k,l])=>(
                    <div key={k} style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"center", padding:"7px 0", borderTop:"1px solid #f5f5f5" }}>
                      <span style={{ fontSize:13, color:COLORS.text }}>{l}</span>
                      <Toggle on={notifCfg.emp[k]} color={COLORS.warning}
                        onToggle={()=>updateNotifCfg({...notifCfg,emp:{...notifCfg.emp,[k]:!notifCfg.emp[k]}})} />
                    </div>
                  ))}
                  {notifCfg.cats.technician && user?.category==="technician" && (
                    <>
                      <div style={{ fontSize:11, fontWeight:700, color:COLORS.muted, margin:"10px 0 8px" }}>⚙️ 기공사 분야</div>
                      {[["cad","⚙️ CAD-CAM"],["denture","🦷 Denture"],["prosthetics","🔩 일반보철"]].map(([k,l])=>(
                        <div key={k} style={{ display:"flex", justifyContent:"space-between",
                            alignItems:"center", padding:"7px 0", borderTop:"1px solid #f5f5f5" }}>
                          <span style={{ fontSize:13, color:COLORS.text }}>{l}</span>
                          <Toggle on={notifCfg.tech[k]} color={COLORS.technician}
                            onToggle={()=>updateNotifCfg({...notifCfg,tech:{...notifCfg.tech,[k]:!notifCfg.tech[k]}})} />
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>

            <button onClick={()=>{
              try{localStorage.removeItem("dj_user");}catch(e){}
              setUser(null); setScreen("login");
            }} style={{ width:"100%", padding:"11px 0", background:"#f5f5f5", border:"none",
                borderRadius:12, color:COLORS.muted, fontWeight:600, fontSize:13,
                cursor:"pointer", marginBottom:14 }}>
              로그아웃
            </button>

            {/* 즐겨찾기 */}
            {bookmarks.length>0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COLORS.text, marginBottom:8 }}>⭐ 즐겨찾기 ({bookmarks.length})</div>
                {posts.filter(p=>bookmarks.includes(p.id)).map(post=>(
                  <div key={post.id} onClick={()=>viewPost(post)}
                    style={{ background:"white", borderRadius:12, padding:"10px 13px",
                      boxShadow:"0 2px 6px rgba(0,0,0,0.05)", cursor:"pointer", marginBottom:6,
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:COLORS.text }}>{post.title}</div>
                      <div style={{ fontSize:11, color:COLORS.muted, marginTop:2 }}>
                        {gi(post.category)} {gl(post.category)} · {post.location}
                      </div>
                    </div>
                    <span onClick={e=>{e.stopPropagation();toggleBookmark(post.id);}}
                          style={{ fontSize:16, cursor:"pointer" }}>⭐</span>
                  </div>
                ))}
              </div>
            )}

            {/* 최근 본 공고 */}
            {recentViewed.length>0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COLORS.text, marginBottom:8 }}>🕐 최근 본 공고</div>
                {recentViewed.map(post=>{
                  const full=posts.find(p=>p.id===post.id);
                  return (
                    <div key={post.id} onClick={()=>full&&viewPost(full)}
                      style={{ background:"white", borderRadius:12, padding:"10px 13px",
                        boxShadow:"0 2px 6px rgba(0,0,0,0.05)", cursor:"pointer", marginBottom:6 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COLORS.text }}>{post.title}</div>
                      <div style={{ fontSize:11, color:COLORS.muted, marginTop:2 }}>
                        {gi(post.category)} {gl(post.category)} · {post.location}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 내가 쓴 공고 */}
            {posts.filter(p=>p.authorId===myName).length>0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COLORS.text, marginBottom:8 }}>📝 내가 쓴 공고</div>
                {posts.filter(p=>p.authorId===myName).map(post=>(
                  <div key={post.id} onClick={()=>viewPost(post)}
                    style={{ background:"white", borderRadius:12, padding:"10px 13px",
                      boxShadow:"0 2px 6px rgba(0,0,0,0.05)", cursor:"pointer",
                      marginBottom:6, opacity:post.closed?0.65:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COLORS.text }}>{post.title}</div>
                      {post.closed && (
                        <span style={{ fontSize:10, background:"#eee", color:"#888",
                            borderRadius:4, padding:"2px 6px", fontWeight:600 }}>
                          {post.type==="구직"?"구직완료":"구인완료"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:COLORS.muted, marginTop:3, display:"flex", gap:10 }}>
                      <span>{gi(post.category)} {gl(post.category)}</span>
                      <span>👁 {post.views||0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 네비게이션 */}
      <div style={{ background:"white", borderTop:"1px solid #eee",
          boxShadow:"0 -2px 8px rgba(0,0,0,0.06)", flexShrink:0,
          paddingBottom:"env(safe-area-inset-bottom)" }}>
        <div style={{ display:"flex", gap:8, padding:"7px 13px 4px" }}>
          {[["구인",`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`],
            ["구직",`linear-gradient(135deg,${COLORS.success},#1aab4a)`]].map(([type,bg])=>(
            <button key={type} onClick={()=>{ setWriteForm(f=>({...f,type})); setShowWrite(true); }}
              style={{ flex:1, padding:"9px 0", background:bg, color:"white",
                border:"none", borderRadius:11, fontSize:12, fontWeight:800, cursor:"pointer" }}>
              ✏️ {type} 글쓰기
            </button>
          ))}
        </div>
        <div style={{ display:"flex" }}>
          {[["home","🏠","홈"],["profile","👤","내정보"]].map(([t,icon,label])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{ flex:1, padding:"5px 0 7px", border:"none", background:"none",
                cursor:"pointer", display:"flex", flexDirection:"column",
                alignItems:"center", gap:1, fontFamily:"'Noto Sans KR',sans-serif" }}>
              <span style={{ fontSize:18 }}>{icon}</span>
              <span style={{ fontSize:10, fontWeight:600, color:tab===t?COLORS.primary:COLORS.muted }}>{label}</span>
              {tab===t && <div style={{ width:14, height:2, background:COLORS.primary, borderRadius:1 }} />}
            </button>
          ))}
        </div>
      </div>

      {/* 공고 상세 모달 */}
      {selPost && (
        <div onClick={e=>{if(e.target===e.currentTarget)setSelPost(null);}}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"white", borderRadius:"20px 20px 0 0", padding:"18px 16px",
              width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"82vh", overflowY:"auto" }}>
            <div style={{ width:36, height:4, background:"#ddd", borderRadius:2, margin:"0 auto 14px" }} />
            <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
              <Badge text={selPost.type} bg={selPost.type==="구인"?COLORS.primary:COLORS.success} color="white" />
              <Badge text={`${gi(selPost.category)} ${gl(selPost.category)}`} bg={gc(selPost.category)+"22"} color={gc(selPost.category)} />
              {selPost.isParttime && <Badge text="알바" bg={COLORS.warning+"22"} color={COLORS.warning} />}
              {selPost.techField  && <Badge text={tl(selPost.techField)} bg={COLORS.technician+"18"} color={COLORS.technician} />}
              {selPost.closed     && <Badge text={selPost.type==="구직"?"구직완료":"구인완료"} bg="#eee" color="#888" />}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ fontSize:17, fontWeight:800, color:COLORS.text, flex:1, lineHeight:1.3 }}>{selPost.title}</div>
              <span onClick={()=>toggleBookmark(selPost.id)}
                    style={{ fontSize:22, cursor:"pointer", paddingLeft:8 }}>
                {bookmarks.includes(selPost.id)?"⭐":"☆"}
              </span>
            </div>
            <div style={{ fontSize:12, color:COLORS.muted, marginBottom:12, lineHeight:1.9 }}>
              {selPost.hospital && <div>🏥 {selPost.hospital}</div>}
              {selPost.name     && <div>👤 {selPost.name} · 경력 {selPost.experience}</div>}
              <div>📍 {selPost.location}</div>
              {selPost.salary   && <div>{fmt(selPost)}</div>}
              <div style={{ display:"flex", gap:12 }}>
                <span>📅 {selPost.createdAt?.toDate?.()?.toLocaleDateString("ko-KR")||""}</span>
                {selPost.views>0 && <span>👁 조회 {selPost.views}회</span>}
              </div>
            </div>
            <div style={{ background:"#f8f9fa", borderRadius:10, padding:12,
                fontSize:13, color:COLORS.text, lineHeight:1.6, marginBottom:14 }}>
              {selPost.description}
            </div>
            {!selPost.closed && (
              <button onClick={()=>{ setShowContact(selPost); setSelPost(null); }}
                style={{ width:"100%", padding:"12px 0",
                  background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
                  color:"white", border:"none", borderRadius:12,
                  fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
                📞 연락하기
              </button>
            )}
            {selPost.authorId===myName && myName!=="" && (
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button onClick={()=>{ setEditPost({...selPost}); setSelPost(null); }}
                  style={{ flex:1, padding:"10px 0", background:"#f0f4ff", border:"none",
                    borderRadius:10, fontSize:12, fontWeight:700, color:COLORS.primary, cursor:"pointer" }}>
                  ✏️ 수정
                </button>
                <button onClick={()=>handleToggleClose(selPost.id,selPost.closed)}
                  style={{ flex:1, padding:"10px 0", border:"none", borderRadius:10,
                    fontSize:12, fontWeight:700, cursor:"pointer",
                    background:selPost.closed?"#e8f5e9":"#fff3e0",
                    color:selPost.closed?COLORS.success:COLORS.warning }}>
                  {selPost.closed?"🔓 재공개":selPost.type==="구직"?"✅ 구직완료":"✅ 구인완료"}
                </button>
                <button onClick={()=>handleDelete(selPost.id)}
                  style={{ flex:1, padding:"10px 0", background:"#fff0f0", border:"none",
                    borderRadius:10, fontSize:12, fontWeight:700, color:COLORS.danger, cursor:"pointer" }}>
                  🗑️ 삭제
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 연락하기 모달 */}
      {showContact && (
        <div onClick={()=>setShowContact(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400,
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"white", borderRadius:20, padding:"22px 18px", width:"100%", maxWidth:340 }}>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:30 }}>📞</div>
              <div style={{ fontSize:15, fontWeight:800, color:COLORS.text, marginTop:6 }}>연락 방법 선택</div>
              <div style={{ fontSize:12, color:COLORS.muted, marginTop:2 }}>
                {showContact.name||showContact.hospital||"게시자"}
              </div>
              {showContact.contact && (
                <div style={{ fontSize:14, fontWeight:700, color:COLORS.primary, marginTop:6,
                    background:COLORS.primary+"11", borderRadius:8, padding:"6px 12px", display:"inline-block" }}>
                  📞 {showContact.contact}
                </div>
              )}
            </div>
            {showContact.contact ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <a href={`tel:${showContact.contact.replace(/-/g,"")}`} style={{ textDecoration:"none" }}>
                  <button style={{ width:"100%", padding:"12px 0",
                      background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
                      color:"white", border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                    📞 전화 걸기
                  </button>
                </a>
                <a href={`sms:${showContact.contact.replace(/-/g,"")}`} style={{ textDecoration:"none" }}>
                  <button style={{ width:"100%", padding:"12px 0",
                      background:COLORS.success+"18", color:COLORS.success,
                      border:`2px solid ${COLORS.success}44`, borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                    💬 문자 보내기
                  </button>
                </a>
                <button onClick={()=>setShowContact(null)}
                  style={{ padding:"9px 0", background:"none", border:"none", color:COLORS.muted, fontSize:13, cursor:"pointer" }}>
                  취소
                </button>
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"8px 0 14px" }}>
                <div style={{ fontSize:13, color:COLORS.muted, marginBottom:14 }}>등록된 연락처가 없습니다</div>
                <button onClick={()=>setShowContact(null)}
                  style={{ padding:"10px 24px", background:COLORS.primary, color:"white",
                    border:"none", borderRadius:12, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  확인
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 글쓰기 모달 */}
      {showWrite && (
        <div onClick={e=>{if(e.target===e.currentTarget)setShowWrite(false);}}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"white", borderRadius:"20px 20px 0 0", padding:"18px 16px",
              width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ width:36, height:4, background:"#ddd", borderRadius:2, margin:"0 auto 14px" }} />
            <div style={{ fontSize:16, fontWeight:800, color:COLORS.text, marginBottom:14 }}>공고 등록</div>

            <label style={S.label}>구인 / 구직</label>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {["구인","구직"].map(t=>(
                <button key={t} onClick={()=>setWriteForm({...writeForm,type:t})}
                  style={{ flex:1, padding:"8px 0", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13,
                    border:`2px solid ${writeForm.type===t?COLORS.primary:"#ddd"}`,
                    background:writeForm.type===t?COLORS.primary:"white",
                    color:writeForm.type===t?"white":COLORS.muted }}>{t}</button>
              ))}
            </div>

            <label style={S.label}>직종</label>
            <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
              {CATS.map(c=>(
                <button key={c.id} onClick={()=>setWriteForm({...writeForm,category:c.id})}
                  style={{ padding:"6px 11px", borderRadius:20, cursor:"pointer", fontWeight:600, fontSize:12,
                    border:`2px solid ${writeForm.category===c.id?c.color:"#ddd"}`,
                    background:writeForm.category===c.id?c.color:"white",
                    color:writeForm.category===c.id?"white":COLORS.muted }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            <label style={S.label}>알바 여부</label>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {[[false,"정규직"],[true,"알바"]].map(([v,l])=>(
                <button key={String(v)} onClick={()=>setWriteForm({...writeForm,isParttime:v})}
                  style={{ flex:1, padding:"8px 0", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:12,
                    border:`2px solid ${writeForm.isParttime===v?COLORS.warning:"#ddd"}`,
                    background:writeForm.isParttime===v?COLORS.warning:"white",
                    color:writeForm.isParttime===v?"white":COLORS.muted }}>{l}</button>
              ))}
            </div>

            {writeForm.category==="technician" && (
              <>
                <label style={S.label}>지원 분야</label>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  {[["cad","⚙️ CAD"],["denture","🦷 Denture"],["prosthetics","🔩 보철"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setWriteForm({...writeForm,techField:v})}
                      style={{ flex:1, padding:"7px 4px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:11,
                        border:`2px solid ${writeForm.techField===v?COLORS.technician:"#ddd"}`,
                        background:writeForm.techField===v?COLORS.technician:"white",
                        color:writeForm.techField===v?"white":COLORS.muted }}>{l}</button>
                  ))}
                </div>
              </>
            )}

            <label style={S.label}>제목 *</label>
            <input style={S.input} placeholder="공고 제목을 입력하세요"
                   value={writeForm.title} onChange={e=>setWriteForm({...writeForm,title:e.target.value})} />

            <label style={S.label}>지역</label>
            <input style={S.input} placeholder="예: 서울 강남구"
                   value={writeForm.location} onChange={e=>setWriteForm({...writeForm,location:e.target.value})} />

            <label style={S.label}>급여 형태 *</label>
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              {["연봉","월급","시급","일급"].map(t=>(
                <button key={t} onClick={()=>setWriteForm({...writeForm,salaryType:t,salary:""})}
                  style={{ flex:1, padding:"7px 0", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:12,
                    border:`2px solid ${writeForm.salaryType===t?COLORS.primary:"#ddd"}`,
                    background:writeForm.salaryType===t?COLORS.primary:"white",
                    color:writeForm.salaryType===t?"white":COLORS.muted }}>{t}</button>
              ))}
            </div>
            <div style={{ position:"relative", marginBottom:8 }}>
              <input style={{...S.input,marginBottom:0,paddingRight:36}} type="number"
                     placeholder="금액 입력" value={writeForm.salary}
                     onChange={e=>setWriteForm({...writeForm,salary:e.target.value})} />
              <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                             fontSize:12, color:COLORS.muted }}>원</span>
            </div>
            {writeForm.salary && (
              <div style={{ background:COLORS.primary+"11", borderRadius:8, padding:"7px 11px",
                  marginBottom:10, fontSize:12, color:COLORS.primary, fontWeight:600 }}>
                💰 {writeForm.salaryType} {Number(writeForm.salary).toLocaleString()}원
              </div>
            )}

            <label style={S.label}>내용</label>
            <textarea style={{...S.input,height:65,resize:"none"}}
                      placeholder="상세 내용을 입력하세요"
                      value={writeForm.description}
                      onChange={e=>setWriteForm({...writeForm,description:e.target.value})} />

            <label style={S.label}>연락처 * <span style={{ fontWeight:400, color:COLORS.muted }}>(지원자에게만 공개)</span></label>
            <div style={{ position:"relative", marginBottom:14 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)",
                             fontSize:13, color:COLORS.muted }}>📞</span>
              <input style={{...S.input,marginBottom:0,paddingLeft:32}}
                     placeholder="010-0000-0000" value={writeForm.contact}
                     onChange={e=>{
                       const num=e.target.value.replace(/\D/g,"").slice(0,11);
                       const f=num.length<=3?num:num.length<=7?`${num.slice(0,3)}-${num.slice(3)}`:`${num.slice(0,3)}-${num.slice(3,7)}-${num.slice(7)}`;
                       setWriteForm({...writeForm,contact:f});
                     }} />
            </div>

            <button onClick={handleWrite}
              style={{ width:"100%", padding:"12px 0",
                background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
                color:"white", border:"none", borderRadius:12,
                fontSize:14, fontWeight:800, cursor:"pointer" }}>
              등록하기 🚀
            </button>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editPost && (
        <div onClick={e=>{if(e.target===e.currentTarget)setEditPost(null);}}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:400, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"white", borderRadius:"20px 20px 0 0", padding:"18px 16px",
              width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"80vh", overflowY:"auto" }}>
            <div style={{ width:36, height:4, background:"#ddd", borderRadius:2, margin:"0 auto 14px" }} />
            <div style={{ fontSize:16, fontWeight:800, color:COLORS.text, marginBottom:14 }}>✏️ 공고 수정</div>

            <label style={S.label}>제목 *</label>
            <input style={S.input} value={editPost.title}
                   onChange={e=>setEditPost({...editPost,title:e.target.value})} />

            <label style={S.label}>지역</label>
            <input style={S.input} value={editPost.location||""}
                   onChange={e=>setEditPost({...editPost,location:e.target.value})} />

            <label style={S.label}>급여 형태</label>
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              {["연봉","월급","시급","일급"].map(t=>(
                <button key={t} onClick={()=>setEditPost({...editPost,salaryType:t})}
                  style={{ flex:1, padding:"7px 0", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:12,
                    border:`2px solid ${editPost.salaryType===t?COLORS.primary:"#ddd"}`,
                    background:editPost.salaryType===t?COLORS.primary:"white",
                    color:editPost.salaryType===t?"white":COLORS.muted }}>{t}</button>
              ))}
            </div>
            <div style={{ position:"relative", marginBottom:10 }}>
              <input style={{...S.input,marginBottom:0,paddingRight:36}} type="number"
                     value={editPost.salary||""}
                     onChange={e=>setEditPost({...editPost,salary:e.target.value})} />
              <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                             fontSize:12, color:COLORS.muted }}>원</span>
            </div>

            <label style={S.label}>연락처</label>
            <div style={{ position:"relative", marginBottom:10 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)",
                             fontSize:13, color:COLORS.muted }}>📞</span>
              <input style={{...S.input,marginBottom:0,paddingLeft:32}}
                     value={editPost.contact||""}
                     onChange={e=>{
                       const num=e.target.value.replace(/\D/g,"").slice(0,11);
                       const f=num.length<=3?num:num.length<=7?`${num.slice(0,3)}-${num.slice(3)}`:`${num.slice(0,3)}-${num.slice(3,7)}-${num.slice(7)}`;
                       setEditPost({...editPost,contact:f});
                     }} />
            </div>

            <label style={S.label}>내용</label>
            <textarea style={{...S.input,height:65,resize:"none"}}
                      value={editPost.description||""}
                      onChange={e=>setEditPost({...editPost,description:e.target.value})} />

            <div style={{ display:"flex", gap:8, marginTop:4 }}>
              <button onClick={()=>setEditPost(null)}
                style={{ flex:1, padding:"10px 0", background:"#f5f5f5", border:"none",
                  borderRadius:12, fontSize:13, fontWeight:700, color:COLORS.muted, cursor:"pointer" }}>
                취소
              </button>
              <button onClick={handleSaveEdit}
                style={{ flex:2, padding:"10px 0",
                  background:`linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`,
                  color:"white", border:"none", borderRadius:12, fontSize:14, fontWeight:800, cursor:"pointer" }}>
                저장하기 ✅
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} color={toastColor} />}
    </div>
  );
}

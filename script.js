// ================= CONFIGURATION =================
const firebaseConfig = {
    apiKey: "AIzaSyABwJfEkkbNB8GurZkyj67R8ksVNEXZ11I",
    authDomain: "ryadanur1-375a8.firebaseapp.com",
    projectId: "ryadanur1-375a8",
    storageBucket: "ryadanur1-375a8.firebasestorage.app",
    messagingSenderId: "858244114090",
    appId: "1:858244114090:web:42cee8e98e3984164392d3"
};
const CLOUD_NAME = "djzfruh22"; 
const CLOUD_PRESET = "udyvggup";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Global State ---
let currentUser = null;
let tempUsedItems = []; // لتخزين المواد اللي الفني اختارها قبل الحفظ
let tempSelectedItem = null; // لتخزين الصنف المراد سحبه مؤقتاً
let userData = null;
let isLoginMode = true;
let selectedSup = null;
let currentTab = 'active'; 
let requestsCache = [];
let uploadQueue = []; 
let tempActionData = {}; 
let selectedTech = null; 
let selectedEng = null; 
let newProfilePicFile = null;
let isFirstLoad = true;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRegistering = false;
let currentComplaintReqId = null; // متغير لتخزين ID البلاغ عند فتح نافذة الشكوى

// Global Vars for Admin, Reports & Feed
let systemSpecialties = [];
let systemLocations = [];
let systemFloors = []; 
let reportChart = null;
let postsListener = null;
let selectedManagerForReport = null;
let inventoryCache = []; // لتخزين بيانات العهدة محلياً

// --- Helpers (English Digits & Time Utils) ---
function toEng(str) {
    if(!str) return '';
    return str.toString().replace(/[٠-٩]/g, d => "0123456789"['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

function formatDateTime(timestamp) {
    if (!timestamp) return { date: '--/--/----', time: '--:--' };
    const date = timestamp.toDate();
    return {
        date: date.toLocaleDateString('en-GB'),
        time: date.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})
    };
}

function generateUniqueCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// --- Authentication Logic ---
auth.onAuthStateChanged(async u => {
    if(isRegistering) return;

    if(u) {
        if(!u.emailVerified) {
            document.getElementById('loader').classList.add('hidden');
            toast("⚠️ يجب تفعيل البريد الإلكتروني أولاً.");
            auth.signOut();
            showScreen('auth-screen');
            return;
        }
        currentUser = u;
        await loadUser();
    } else {
        document.getElementById('loader').classList.add('hidden');
        showScreen('auth-screen');
    }
});

// --- Handle Auth (Create Account / Login) ---
async function handleAuth() {
    const email = document.getElementById('email').value; 
    const pass = document.getElementById('password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    const btn = document.getElementById('auth-btn'); 

    if(!isLoginMode) {
         if(pass !== confirmPass) return toast("❌ كلمة المرور غير متطابقة");
         if(pass.length < 6) return toast("❌ كلمة المرور ضعيفة");
         
         // === التعديل الجديد: التحقق من رقم الهاتف ===
         const phoneCheck = document.getElementById('reg-phone').value.trim();
         if (!phoneCheck || phoneCheck.length < 11) return toast("⚠️ رقم الهاتف مطلوب وصحيح للتواصل");
         // ==========================================
    }

    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري تسجيل الدخول...';
    
    try {
        if(isLoginMode) {
            await auth.signInWithEmailAndPassword(email, pass);
        } else {
            isRegistering = true; 

            const role = document.querySelector('input[name="auth-role"]:checked').value;
            const gender = document.querySelector('input[name="auth-gender"]:checked').value;
            const fullName = document.getElementById('reg-name').value;
            const jobTitle = document.getElementById('reg-job').value;
            const locationVal = document.getElementById('reg-loc').value;
            const phone = document.getElementById('reg-phone').value; // الرقم هنا أصبح مضموناً
            const defaultPic = gender === 'male' ? 'https://cdn-icons-png.flaticon.com/512/4140/4140048.png' : 'https://cdn-icons-png.flaticon.com/512/4140/4140047.png';

            if(role === 'manager') {
                  const mSnap = await db.collection('users').where('role', '==', 'manager').get();
                  if(mSnap.size >= 4) throw new Error("⛔ تم اكتمال عدد المديرين (4).");
            }

            const cred = await auth.createUserWithEmailAndPassword(email, pass);

            await db.collection('users').doc(cred.user.uid).set({
                email: email,
                role: role,
                fullName: fullName,
                gender: gender,
                photoUrl: defaultPic,
                shortId: Math.random().toString(36).substr(2,6).toUpperCase(),
                jobTitle: jobTitle,
                location: locationVal,
                phone: phone, // حفظ الرقم
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await cred.user.sendEmailVerification();
            toast("✅ تم إنشاء الحساب. راجع بريدك للتفعيل.");
            
            isRegistering = false; 
            toggleAuth(); 
        }
    } catch(e) { 
        console.error(e);
        toast(e.message); 
        isRegistering = false;
    } finally { 
        btn.disabled=false; 
        btn.innerText = isLoginMode?"تسجيل الدخول":"إنشاء حساب"; 
    }
}

function toggleAuth() { 
    isLoginMode = !isLoginMode; 
    const regFields = document.getElementById('reg-fields');
    const confirmPass = document.getElementById('confirm-pass-field');
    if (isLoginMode) {
        regFields.classList.add('hidden'); confirmPass.classList.add('hidden');
        document.getElementById('auth-btn').innerText = "تسجيل الدخول";
        document.getElementById('auth-switch-text').innerHTML = "ليس لديك حساب؟ <b style='color:var(--primary)'>إنشاء حساب جديد</b>";
    } else {
        regFields.classList.remove('hidden'); confirmPass.classList.remove('hidden');
        document.getElementById('auth-btn').innerText = "إنشاء حساب";
        document.getElementById('auth-switch-text').innerHTML = "لديك حساب بالفعل؟ <b style='color:var(--primary)'>تسجيل الدخول</b>";
    }
}

// --- Core User Loading & System Setup ---
async function loadUser() {
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if(doc.exists) {
            userData = doc.data();
            if(!userData.shortId) {
                await db.collection('users').doc(currentUser.uid).update({shortId: Math.random().toString(36).substr(2,6).toUpperCase()});
            }
            
            await fetchSystemData();

            renderHeader();
            showScreen('app-container');
            setupRoleUI(); 

            loadInventory(); // تحميل العهدة في الخلفية عشان البحث يشتغل
            
            loadFeed();
            loadTeam(); 
            loadFriendReqs();
            loadProfilePageData();
            
            document.getElementById('req-date').valueAsDate = new Date();
            const now = new Date();
            const timeString = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
            document.getElementById('req-time').value = timeString;

            checkUnseenNotifications();

            setTimeout(() => { document.getElementById('loader').classList.add('hidden'); }, 500);
        }
    } catch(e) { 
        console.error(e);
        document.getElementById('loader').classList.add('hidden');
        toast("⚠️ خطأ في تحميل البيانات"); 
    }
}

// --- Admin: System Data ---
async function fetchSystemData() {
    try {
        const doc = await db.collection('system_settings').doc('config').get();
        if(doc.exists) {
            const data = doc.data();
            systemSpecialties = data.specialties || [];
            systemLocations = data.locations || [];
            systemFloors = data.floors || [];
        } else {
            systemSpecialties = ['كهرباء', 'سباكة', 'نجارة', 'تكييف', 'شبكات (IT)', 'أجهزة طبية'];
            systemLocations = ['المبنى الإداري', 'كلية الطب', 'كلية الصيدلة', 'كلية الهندسة', 'كلية الأسنان', 'المسجد'];
            systemFloors = ['الدور الأرضي', 'الدور الأول', 'الدور الثاني', 'الدور الثالث'];
            await db.collection('system_settings').doc('config').set({
                specialties: systemSpecialties,
                locations: systemLocations,
                floors: systemFloors
            });
        }
        populateDropdowns();
        renderAdminLists();
    } catch(e) { console.error("Error fetching system data", e); }
}

function populateDropdowns() {
    const typeSelect = document.getElementById('req-type');
    const locSelect = document.getElementById('req-faculty');
    const floorSelect = document.getElementById('req-floor');
    const invLocSelect = document.getElementById('inv-faculty');
    const invFloorSelect = document.getElementById('inv-floor');

    typeSelect.innerHTML = '<option value="">اختر التخصص...</option>';
    systemSpecialties.forEach(spec => { typeSelect.innerHTML += `<option value="${spec}">${spec}</option>`; });

    let locOptions = '<option value="">اختر المبنى/الكلية...</option>';
    systemLocations.forEach(loc => { locOptions += `<option value="${loc}">${loc}</option>`; });
    locSelect.innerHTML = locOptions + '<option value="Other">موقع آخر...</option>';
    invLocSelect.innerHTML = locOptions;

    let floorOptions = '<option value="">اختر الدور...</option>';
    systemFloors.forEach(f => { floorOptions += `<option value="${f}">${f}</option>`; });
    floorSelect.innerHTML = floorOptions;
    invFloorSelect.innerHTML = floorOptions;
}

// --- Role UI Setup (Updated for Complaints Tab) ---
function setupRoleUI() {
    const r = userData.role;
    const shortcuts = document.getElementById('manager-shortcuts');
    const staffShortcuts = document.getElementById('staff-shortcuts'); 
    const adminBtn = document.getElementById('btn-admin-panel');
    const settingsManagerArea = document.getElementById('settings-manager-area');
    const settingsStaffArea = document.getElementById('settings-staff-area'); 
    const createPostBox = document.getElementById('create-post-box');
    const navCreateBtn = document.getElementById('nav-create-btn'); 

    if(r === 'manager' || r === 'engineer' || r === 'technician') {
         navCreateBtn.classList.add('hidden');
         document.getElementById('page-create').innerHTML = "<div style='text-align:center; padding:50px; color:#999;'><i class='fa-solid fa-lock fa-2x'></i><p>غير مصرح بإنشاء بلاغات لهذا الحساب.</p></div>";
    }
    if(r === 'manager' || r === 'engineer') {
        shortcuts.classList.remove('hidden');
        settingsManagerArea.classList.remove('hidden');
        
        // إظهار زر تبويب الشكاوي للمدير والمهندس فقط
        const complaintsTab = document.getElementById('btn-tab-complaints');
        if(complaintsTab) complaintsTab.classList.remove('hidden');

        if(r === 'manager') adminBtn.classList.remove('hidden');
    }
    if(r === 'supervisor' || r === 'employee') {
        staffShortcuts.classList.remove('hidden');
        settingsStaffArea.classList.remove('hidden');
    }
    if(r === 'manager' || r === 'engineer' || r === 'supervisor') {
        createPostBox.classList.remove('hidden'); 
    }
}

// --- Admin Panel Logic ---
async function addSystemData(type) {
    let inputId = (type === 'specialties') ? 'new-spec-input' : (type === 'locations' ? 'new-loc-input' : 'new-floor-input');
    let val = document.getElementById(inputId).value.trim();
    if(!val) return;
    try {
        await db.collection('system_settings').doc('config').update({ [type]: firebase.firestore.FieldValue.arrayUnion(val) });
        document.getElementById(inputId).value = ""; toast("✅ تم الإضافة"); await fetchSystemData();
    } catch(e) { toast("خطأ"); }
}

async function deleteSystemData(type, item) {
    if(!confirm("هل أنت متأكد من الحذف؟")) return;
    try {
        await db.collection('system_settings').doc('config').update({ [type]: firebase.firestore.FieldValue.arrayRemove(item) });
        toast("🗑️ تم الحذف"); await fetchSystemData(); 
    } catch(e) { toast("خطأ"); }
}

function renderAdminLists() {
    const specsDiv = document.getElementById('admin-specs-list');
    const locsDiv = document.getElementById('admin-locs-list');
    const floorsDiv = document.getElementById('admin-floors-list');
    
    specsDiv.innerHTML = ""; systemSpecialties.forEach(item => { specsDiv.innerHTML += `<div class="admin-list-item"><span>${item}</span><div class="delete-icon" onclick="deleteSystemData('specialties', '${item}')"><i class="fa-solid fa-trash"></i></div></div>`; });
    locsDiv.innerHTML = ""; systemLocations.forEach(item => { locsDiv.innerHTML += `<div class="admin-list-item"><span>${item}</span><div class="delete-icon" onclick="deleteSystemData('locations', '${item}')"><i class="fa-solid fa-trash"></i></div></div>`; });
    floorsDiv.innerHTML = ""; systemFloors.forEach(item => { floorsDiv.innerHTML += `<div class="admin-list-item"><span>${item}</span><div class="delete-icon" onclick="deleteSystemData('floors', '${item}')"><i class="fa-solid fa-trash"></i></div></div>`; });
}

// --- Navigation ---
function nav(p, el) { 
    document.querySelectorAll('.page-section').forEach(x=>x.classList.add('hidden')); 
    document.getElementById('page-'+p).classList.remove('hidden'); 
    
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); 
    if(p !== 'create' && p !== 'reports' && p !== 'admin-settings' && p !== 'inventory') {
        if(el) el.classList.add('active'); 
    }

    if(p==='profile') loadProfilePageData(); 
    if(p==='reports') generateReports(); 
    if(p==='albayan') { loadFeedPosts(); document.getElementById('feed-badge').classList.remove('active'); }
    if(p==='inventory') loadInventory();
}

function showScreen(id) { 
    ['auth-screen','app-container'].forEach(x => document.getElementById(x).classList.add('hidden')); 
    document.getElementById(id).classList.remove('hidden'); 
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function logout() { auth.signOut(); location.reload(); }
function toast(m) { const t=document.getElementById('toast'); t.innerHTML=m; t.style.display='block'; setTimeout(()=>t.style.display='none',3000); }

function renderHeader() {
    const roleMap = { 'employee': 'موظف', 'supervisor': 'مشرف', 'manager': 'مدير', 'technician': 'فني', 'engineer': 'مهندس' };
    
    document.getElementById('banner-name').innerText = userData.fullName;
    document.getElementById('banner-role').innerText = roleMap[userData.role] || userData.role;
    
    // === التعديل: إضافة أيقونة النسخ ===
    document.getElementById('banner-id').innerHTML = `
        ID: <span class="en-num">${toEng(userData.shortId)}</span>
        <i class="fa-regular fa-copy copy-btn-icon" onclick="copyId()" title="نسخ الـ ID"></i>
    `;
    // ================================

    document.getElementById('banner-img').src = userData.photoUrl;
    const frameEl = document.getElementById('banner-frame');
    frameEl.className = 'frame-overlay ' + (userData.frame || '');
}

// --- Media & Recording ---
function handleFiles(input) { Array.from(input.files).forEach(file => { addToQueue(file); }); }
function addToQueue(f) {
    uploadQueue.push(f);
    const grid = document.getElementById('preview-grid');
    const index = uploadQueue.length - 1;
    let content = f.type.startsWith('image') ? `<img src="${URL.createObjectURL(f)}">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#eee;color:#777;"><i class="fa-solid fa-file"></i></div>`;
    grid.innerHTML += `<div class="media-item">${content}<div class="remove-file" onclick="uploadQueue.splice(${index},1); this.parentElement.remove()">x</div></div>`;
}

async function toggleRecording() {
    const btn = document.getElementById('mic-trigger');
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
                addToQueue(audioFile);
            };
            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
            toast("بدأ التسجيل...");
        } catch (err) { toast("❌ الميكروفون غير متاح"); }
    } else {
        if(mediaRecorder) { mediaRecorder.stop(); isRecording = false; btn.classList.remove('recording'); toast("تم حفظ التسجيل"); }
    }
}

// --- FEED ---
function loadFeed() {
    let q = db.collection('requests');
    if(userData.role === 'employee') q = q.where('userId','==',currentUser.uid);
    else if(userData.role === 'supervisor') q = q.where('supervisorId','==',currentUser.uid);
    else if(userData.role === 'engineer') q = q.where('engineerId','==',currentUser.uid);
    else if(userData.role === 'technician') q = q.where('technicianId','==',currentUser.uid);

    q.onSnapshot(snap => {
        const currentIds = requestsCache.map(r => r.id);
        let newItems = [];
        let updatedCache = [];
        snap.forEach(doc => {
            const data = {id: doc.id, ...doc.data()};
            updatedCache.push(data);
            if (!isFirstLoad && !currentIds.includes(doc.id)) newItems.push(data);
        });
        requestsCache = updatedCache;
        requestsCache.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        if(!isFirstLoad && newItems.length > 0) checkAndPlaySound(newItems);
        isFirstLoad = false;
        renderFeed();
    });
}

function checkAndPlaySound(newRequests) {
    let notify = false;
    if(userData.role === 'supervisor' && newRequests.some(r => r.status === 'pending')) notify = true;
    if(userData.role === 'engineer' && newRequests.some(r => r.status === 'at_engineer')) notify = true;
    if(userData.role === 'technician' && newRequests.some(r => r.status === 'at_tech')) notify = true;
    if(userData.role === 'employee' && newRequests.some(r => r.status === 'pending_confirmation')) notify = true;
    if (notify) {
        const audio = document.getElementById('sound-notify-req');
        if(audio) audio.play().catch(e => console.log("Audio block"));
        toast("🔔 إشعار جديد");
        document.querySelector('.bell-badge').style.display = 'block';
    }
}

// --- Render Feed (Updated for Complaints & Tech Buttons) ---
function renderFeed() {
    const container = document.getElementById('requests-feed'); container.innerHTML = "";
    let list = requestsCache;

    // فلترة القوائم بناءً على التبويب
    if(currentTab === 'trash') {
        list = list.filter(r => r.isDeleted === true);
    } else if (currentTab === 'complaints') {
        // تبويب الشكاوي: يظهر فقط البلاغات التي تحتوي على حقل hasComplaint
        list = list.filter(r => r.isDeleted !== true && r.hasComplaint === true);
    } else {
        // المهام الجارية والأرشيف
        list = list.filter(r => r.isDeleted !== true);
        if(currentTab === 'active') list = list.filter(r => ['pending','at_engineer','at_tech','working','pending_confirmation'].includes(r.status));
        else if(currentTab === 'history') list = list.filter(r => ['done','rejected'].includes(r.status));
    }

    if(list.length === 0) { container.innerHTML = `<div style="text-align:center; padding:50px 20px; color:var(--text-muted);"><i class="fa-regular fa-clipboard fa-3x" style="opacity:0.5; margin-bottom:10px;"></i><p>لا يوجد بيانات</p></div>`; return; }

    list.forEach(d => {
        let statusClass = 'st-' + d.status;
        let statusText = getStatusLabel(d.status);
        let codeBadge = `<span class="req-code">#${toEng(d.uniqueCode || '---')}</span>`;
        let timeInfo = formatDateTime(d.createdAt);
        
        // تمييز الكارت إذا كان به شكوى
        let cardStyleClass = d.hasComplaint ? 'has-complaint' : '';
        // تم حذف كلمة "تصعيد"
        // استبدل السطر القديم بهذا السطر فقط:
        // يظهر التنبيه فقط إذا كان البلاغ يحتوي على شكوى، ونحن لسنا في تبويب الشكاوي حالياً
        let complaintHeader = (d.hasComplaint && currentTab !== 'complaints') ? `<div class="complaint-badge"><i class="fa-solid fa-triangle-exclamation"></i> يوجد شكوى نشطة</div>` : '';

        let actionBtns = "";
        let deleteBtn = "";
        if(userData.role === 'manager' && currentTab !== 'trash') deleteBtn = `<button onclick="event.stopPropagation(); softDelete('${d.id}')" class="btn-ghost btn-sm" style="color:var(--error); border-color:var(--border); margin-left:10px;"><i class="fa-solid fa-trash"></i></button>`;
        else if (userData.role === 'manager' && currentTab === 'trash') deleteBtn = `<button onclick="event.stopPropagation(); restoreReq('${d.id}')" class="btn-ghost btn-sm" style="color:var(--success); margin-left:5px;">استعادة</button><button onclick="event.stopPropagation(); hardDelete('${d.id}')" class="btn-ghost btn-sm" style="color:var(--error);">حذف نهائي</button>`;

        // === زر تقديم الشكوى (يظهر للموظف والمشرف فقط في المهام الجارية) ===
        let complaintBtn = "";
        if (currentTab === 'active' && (userData.role === 'employee' || userData.role === 'supervisor') && d.status !== 'done' && !d.hasComplaint) {
            // تم حذف كلمة "تصعيد"
            complaintBtn = `<button onclick="event.stopPropagation(); openComplaintModal('${d.id}')" class="btn-complaint-modern"><i class="fa-solid fa-bullhorn"></i> تقديم شكوى</button>`;
        }

        // Action Buttons Logic
        if(currentTab === 'active') {
            if(userData.role === 'supervisor' && d.status === 'pending') actionBtns = `<div style="display:flex; gap:10px;"><button onclick="event.stopPropagation(); openAction('${d.id}','sup_approve')" class="btn-main btn-sm" style="background:var(--success);">توجيه للمهندس</button><button onclick="event.stopPropagation(); openAction('${d.id}','reject')" class="btn-main btn-danger btn-sm">رفض</button></div>`;
            else if(userData.role === 'engineer' && d.status === 'at_engineer') actionBtns = `<div style="display:flex; gap:10px;"><button onclick="event.stopPropagation(); openAction('${d.id}','eng_assign')" class="btn-main btn-sm" style="background:var(--purple); color:#fff;">تعيين الفني</button><button onclick="event.stopPropagation(); openAction('${d.id}','reject')" class="btn-main btn-danger btn-sm">رفض</button></div>`;
            else if(userData.role === 'technician') {
                if(d.status === 'at_tech') {
                     // === أزرار الفني الثلاثة المستقلة ===
                     actionBtns = `
                     <div style="display:flex; gap:8px; width:100%; margin-top:12px;">
                         <button onclick="event.stopPropagation(); openAction('${d.id}','tech_accept_init')" class="btn-sm tech-action-btn btn-grad-success"><i class="fa-solid fa-play"></i> بدء</button>
                         <button onclick="event.stopPropagation(); openAction('${d.id}','tech_transfer_init')" class="btn-sm tech-action-btn btn-grad-blue"><i class="fa-solid fa-share"></i> تحويل</button>
                         <button onclick="event.stopPropagation(); openAction('${d.id}','tech_reject_init')" class="btn-sm tech-action-btn btn-grad-danger"><i class="fa-solid fa-xmark"></i> رفض</button>
                     </div>`;
                }
                else if (d.status === 'working') actionBtns = `<button onclick="event.stopPropagation(); openAction('${d.id}','tech_finish')" class="btn-main btn-sm" style="background:var(--success);">تم الإصلاح</button>`;
                else if (d.status === 'pending_confirmation') actionBtns = `<span style="font-size:11px; color:var(--text-muted); font-weight:bold;">بانتظار تأكيد الموظف...</span>`;
            } else if(userData.role === 'employee' && d.status === 'pending_confirmation' && d.userId === currentUser.uid) {
                actionBtns = `<div style="display:flex; gap:5px; width:100%;"><button onclick="event.stopPropagation(); openAction('${d.id}','emp_confirm')" class="btn-main btn-sm" style="background:var(--success); flex:1;">تأكيد وإنهاء</button><button onclick="event.stopPropagation(); openAction('${d.id}','emp_deny')" class="btn-main btn-danger btn-sm" style="flex:1;">لم يتم</button></div>`;
            }
        }
         // عرض تفاصيل الشكوى إذا كنا في تبويب الشكاوي
         // عرض تفاصيل الشكوى (تصميم مودرن)
        let complaintDetails = "";
        if (currentTab === 'complaints' && d.complaintData) {
            // تحديد اسم الفني (إذا لم يوجد فني، نكتب غير محدد)
            let techName = d.technicianName ? d.technicianName : 'لم يتم تعيين فني';
            
            complaintDetails = `
            <div class="complaint-box-modern">
                <div class="c-header">
                    <i class="fa-solid fa-file-circle-exclamation"></i>
                    <span>تفاصيل الشكوى</span>
                    <span class="en-num" style="margin-right:auto; font-size:10px; color:#9ca3af;">${formatDateTime(d.complaintData.at).date}</span>
                </div>

                <div class="c-body">
                    "${d.complaintData.text}"
                </div>

                <div class="c-meta-grid">
                    <div class="c-meta-item">
                        <i class="fa-solid fa-user-pen"></i>
                        <span>مقدم الشكوي: <b>${d.complaintData.by}</b></span>
                    </div>
                    <div class="c-meta-item">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                        <span>الفني القائم: <b>${techName}</b></span>
                    </div>
                </div>
                ${userData.role === 'manager' || userData.role === 'engineer' ? 
                `<button onclick="event.stopPropagation(); openResolveModal('${d.id}')" class="btn-resolve-modern"><i class="fa-solid fa-check"></i> إغلاق الشكوى (تم الحل)</button>` 
                : ''}
            </div>`;
        }

        let prioIcon = d.priority === 'high' ? '<i class="fa-solid fa-fire" style="color:var(--error)"></i>' : '';
        let prioColor = d.priority === 'high' ? 'var(--error)' : d.priority === 'medium' ? 'var(--warning)' : 'var(--success)';
        
        container.innerHTML += `
        <div class="glass-card request-card ${cardStyleClass}" onclick="openRequestDetails('${d.id}')" style="border-right: 4px solid ${prioColor};">
            ${complaintHeader}
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${d.userData.photoUrl}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid var(--surface-light);">
                    <div>
                        <b style="font-size:13px; display:block; color:var(--text);">${d.userData.fullName}</b>
                        <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto'; display:flex; gap:5px; align-items:center;">
                            ${timeInfo.date} <span style="width:3px;height:3px;background:#ccc;border-radius:50%;"></span> ${timeInfo.time}
                        </div>
                    </div>
                </div>
                ${codeBadge}
            </div>
            
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--surface-light);">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-size:11px; font-weight:bold; color:var(--primary); background:rgba(0,86,179,0.05); padding:2px 8px; border-radius:6px;">${d.type}</span>
                    <span class="status-pill ${statusClass}">${statusText}</span>
                </div>
                <div style="font-size:14px; color:var(--text); line-height:1.5;">${prioIcon} ${d.description}</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${d.faculty}</div>
                ${deleteBtn}
            </div>
            ${actionBtns ? `<div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--border);"> ${actionBtns} </div>` : ''}
            ${complaintBtn}
            ${complaintDetails}
        </div>`;
    });
}

// --- Create Request Workflow ---
async function openSupModal() { 
    if(!document.getElementById('req-desc').value) return toast("⚠️ الوصف مطلوب");
    if(!document.getElementById('req-type').value) return toast("⚠️ نوع العطل مطلوب");
    
    document.getElementById('sup-modal').classList.remove('hidden'); 
    const l=document.getElementById('sup-list'); 
    l.innerHTML="<p style='text-align:center'>جاري تحميل المشرفين (الأصدقاء)...</p>"; 
    
    const friendsSnap = await db.collection('users').doc(currentUser.uid).collection('friends').get();
    if(friendsSnap.empty) { l.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'><p>لا يوجد أصدقاء.</p></div>"; return; }
    const friendIds = friendsSnap.docs.map(doc => doc.data().friendId);
    
    const snap = await db.collection('users').where('role','==','supervisor').get();
    l.innerHTML="";
    let count = 0;
    snap.forEach(d=>{ 
        if(friendIds.includes(d.id)) { 
            const u=d.data(); 
            l.innerHTML+=`<div class="manager-card" onclick="selectSup(this, '${d.id}')"><img src="${u.photoUrl}"><span>${u.fullName}</span></div>`;
            count++;
        }
    }); 
    if(count === 0) l.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'><p>لم يتم العثور على مشرفين.</p></div>";
}

function selectSup(el, id) { 
    document.querySelectorAll('.manager-card').forEach(d=>d.classList.remove('selected'));
    el.classList.add('selected'); selectedSup=id; 
}

async function sendRequestFinal() { 
    if(!selectedSup) return toast("⚠️ اختر مشرف");
    const btn=document.getElementById('confirm-send-btn'); btn.disabled=true; btn.innerText="جاري الإرسال...";
    
    try { 
        let mediaLinks = [];
        for(const file of uploadQueue) {
            const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', CLOUD_PRESET);
            if(file.type.startsWith('audio')) fd.append('resource_type', 'video'); 
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {method:'POST', body:fd});
            const d = await res.json();
            let type = file.type.startsWith('video') ? 'video' : (file.type.startsWith('audio') ? 'audio' : 'image');
            mediaLinks.push({url: d.secure_url, type: type});
        }
        
        const facSelect = document.getElementById('req-faculty');
        let facText = facSelect.options[facSelect.selectedIndex].text;
        if(facSelect.value === 'Other') facText = "موقع آخر";
        const floorSelect = document.getElementById('req-floor');
        let floorText = floorSelect.value || '';
        const roomVal = document.getElementById('req-room').value;

        const loc = `${facText} - ${floorText} - ${roomVal}`; 
        const uniqueCode = generateUniqueCode();

        await db.collection('requests').add({ 
            userId:currentUser.uid, 
            userData:{ fullName:userData.fullName, photoUrl:userData.photoUrl }, 
            supervisorId:selectedSup, 
            status:'pending', 
            type: document.getElementById('req-type').value,
            priority: document.querySelector('input[name="prio"]:checked').value,
            time: document.getElementById('req-time').value, 
            date: document.getElementById('req-date').value, 
            description: document.getElementById('req-desc').value, 
            location: loc, 
            faculty: facText, 
            floor: floorText, 
            room: roomVal, 
            media: mediaLinks,
            uniqueCode: uniqueCode, 
            isDeleted: false,
            createdBy: userData.fullName, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        }); 
        
        toast("✅ تم الإرسال. كود البلاغ: " + uniqueCode); closeModal('sup-modal'); 
        nav('home', document.querySelector('.nav-item:first-child'));
        uploadQueue=[]; document.getElementById('preview-grid').innerHTML=""; document.getElementById('req-desc').value="";
    } catch(e){ toast("❌ خطأ"); console.error(e); } finally{ btn.disabled=false; btn.innerText="إرسال البلاغ"; } 
}

// --- Action Logic ---
async function openAction(id, type) {
    tempActionData = { id, type };
    document.getElementById('action-modal').classList.remove('hidden');
    document.getElementById('act-comment').value = "";
    document.getElementById('act-comment').placeholder = "اكتب ملاحظات...";
    
    // إخفاء كل العناصر الفرعية افتراضياً
    document.getElementById('eng-select-area').classList.add('hidden');
    document.getElementById('tech-select-area').classList.add('hidden');
    document.getElementById('tech-finish-form').classList.add('hidden');
    
    // إخفاء رابر قرارات الفني مبدئياً
    const techWrapper = document.getElementById('tech-decision-wrapper');
    if(techWrapper) techWrapper.classList.add('hidden');
    
    // إعادة إظهار التوجل (internal/external) لأنه قد يكون مخفياً من عملية تحويل سابقة
    const techTypeToggle = document.querySelector('input[name="tech-type"]')?.parentElement?.parentElement;
    if(techTypeToggle) techTypeToggle.classList.remove('hidden');

    const titles = { 'sup_approve': 'قبول وتوجيه للمهندس', 'eng_assign': 'تعيين الفني المختص', 'tech_finish': 'إنهاء العمل', 'emp_confirm': 'تأكيد إتمام الإصلاح', 'emp_deny': 'رفض الاستلام', 'reject': 'رفض الطلب' };
    
    // عنوان افتراضي، سيتغير بالأسفل إذا كان إجراء فني
    document.getElementById('act-title').innerText = titles[type] || 'إجراء';

    if(type === 'sup_approve') { 
        document.getElementById('eng-select-area').classList.remove('hidden'); loadEngineers(); 
    }
    else if(type === 'eng_assign') {
        document.getElementById('tech-select-area').classList.remove('hidden');
        document.querySelector('input[name="tech-type"][value="internal"]').checked = true;
        toggleTechType('internal'); loadTechnicians();
    }
    // === التعامل مع الأزرار الثلاثة المستقلة ===
    else if (type === 'tech_accept_init' || type === 'tech_transfer_init' || type === 'tech_reject_init') {
        document.getElementById('act-title').innerText = 'إجراء الفني';
        
        // تغيير نوع الإجراء ليتم معالجته في submitAction كـ tech_start (الذي يقرأ الراديو)
        tempActionData.type = 'tech_start'; 

        if(techWrapper) {
            techWrapper.classList.remove('hidden');
            
            // تحديد القيمة بناءً على الزر المضغوط
            let val = 'accept';
            if(type === 'tech_transfer_init') val = 'transfer';
            if(type === 'tech_reject_init') val = 'reject';
            
            // تفعيل الراديو المناسب
            const radio = document.querySelector(`input[name="tech-action"][value="${val}"]`);
            if(radio) {
                radio.checked = true;
                handleTechDecision(val); // تحديث الواجهة فوراً
            }
        }
    }
    else if (type === 'tech_finish') {
        document.getElementById('tech-finish-form').classList.remove('hidden');
        document.getElementById('cost-items-container').innerHTML = ''; addCostItemRow(); 
    }
}

// === دالة التحكم في واجهة الفني ===
function handleTechDecision(val) {
    const techSelectArea = document.getElementById('tech-select-area');
    const commentBox = document.getElementById('act-comment');
    
    // إخفاء قائمة الفنيين مبدئياً
    techSelectArea.classList.add('hidden');
    
    if (val === 'transfer') {
        // إذا تحويل: أظهر القائمة
        techSelectArea.classList.remove('hidden');
        
        // إخفاء الـ Toggle الخاص بـ internal/external (لأن التحويل لزميل فقط)
        const techTypeToggle = document.querySelector('input[name="tech-type"]')?.parentElement?.parentElement;
        if(techTypeToggle) techTypeToggle.classList.add('hidden');
        
        // إجبار الاختيار على internal
        const radioInternal = document.querySelector('input[name="tech-type"][value="internal"]');
        if(radioInternal) radioInternal.checked = true;
        
        // إظهار القائمة الداخلية وإخفاء فورم الخارجي
        document.getElementById('tech-list-action').classList.remove('hidden');
        document.getElementById('ext-tech-form').classList.add('hidden');
        
        loadTechsForTransfer(); // تحميل الفنيين الآخرين
        commentBox.placeholder = "سبب التحويل...";
    } else if (val === 'reject') {
        commentBox.placeholder = "سبب الرفض (إجباري)...";
    } else {
        // حالة القبول (Accept)
        commentBox.placeholder = "ملاحظات (اختياري)...";
    }
}

// === دالة تحميل الفنيين للتحويل (استثناء الحالي) ===
async function loadTechsForTransfer() {
    const list = document.getElementById('tech-list-action');
    list.innerHTML = "جاري التحميل...";
    // جلب الفنيين
    const snap = await db.collection('users').where('role','==','technician').get();
    list.innerHTML = "";
    
    let count = 0;
    snap.forEach(doc => { 
        if(doc.id === currentUser.uid) return; // لا تعرض نفسي
        const u = doc.data(); 
        list.innerHTML += `<div class="tech-select-card" onclick="selTech(this, '${doc.id}', '${u.fullName}')"><img src="${u.photoUrl}"><div style="font-size:12px; font-weight:bold;">${u.fullName}</div></div>`; 
        count++;
    });
    
    if(count === 0) list.innerHTML = "<p style='color:red;font-size:11px;'>لا يوجد فنيين آخرين متاحين</p>";
}

function addCostItemRow() {
    const container = document.getElementById('cost-items-container');
    const div = document.createElement('div');
    div.className = 'cost-item-row';
    div.innerHTML = `<input type="text" class="cost-name" placeholder="اسم المادة/الأداة" style="flex:2; font-size:12px;"><input type="number" class="cost-val en-num" placeholder="السعر" style="flex:1; font-size:12px;">`;
    container.appendChild(div);
}

async function loadEngineers() {
    const list = document.getElementById('eng-list-action'); list.innerHTML = "جاري التحميل...";
    const snap = await db.collection('users').where('role','==','engineer').get();
    list.innerHTML = "";
    if(snap.empty) { list.innerHTML = "<p style='grid-column:span 2;color:red;font-size:11px;'>لا يوجد مهندسين</p>"; return; }
    snap.forEach(doc => { const u = doc.data(); list.innerHTML += `<div class="tech-select-card" onclick="selEng(this, '${doc.id}', '${u.fullName}')"><img src="${u.photoUrl}"><div style="font-size:12px; font-weight:bold;">${u.fullName}</div></div>`; });
}
function selEng(el, id, name) { document.querySelectorAll('#eng-list-action .tech-select-card').forEach(d=>d.classList.remove('selected')); el.classList.add('selected'); selectedEng={id, name}; }

function toggleTechType(val) {
    if(val === 'internal') { document.getElementById('tech-list-action').classList.remove('hidden'); document.getElementById('ext-tech-form').classList.add('hidden'); } 
    else { document.getElementById('tech-list-action').classList.add('hidden'); document.getElementById('ext-tech-form').classList.remove('hidden'); }
}

async function loadTechnicians() {
    const list = document.getElementById('tech-list-action'); list.innerHTML = "جاري التحميل...";
    const snap = await db.collection('users').where('role','==','technician').get();
    list.innerHTML = "";
    if(snap.empty) { list.innerHTML = "<p style='grid-column:span 2;color:red;font-size:11px;'>لا يوجد فنيين</p>"; return; }
    snap.forEach(doc => { const u = doc.data(); list.innerHTML += `<div class="tech-select-card" onclick="selTech(this, '${doc.id}', '${u.fullName}')"><img src="${u.photoUrl}"><div style="font-size:12px; font-weight:bold;">${u.fullName}</div></div>`; });
}
function selTech(el, id, name) { document.querySelectorAll('#tech-list-action .tech-select-card').forEach(d=>d.classList.remove('selected')); el.classList.add('selected'); selectedTech={id, name}; }

async function submitAction() {
    const { id, type } = tempActionData;
    const comment = document.getElementById('act-comment').value;
    const btn = document.getElementById('act-submit-btn');
    btn.disabled = true;

    try {
        let updateData = { lastUpdate: firebase.firestore.FieldValue.serverTimestamp() };
        if(comment) updateData.notes = comment;

        if(type === 'sup_approve') {
            if(!selectedEng) return toast("⚠️ اختر مهندس");
            updateData.status = 'at_engineer'; updateData.engineerId = selectedEng.id; updateData.engineerName = selectedEng.name;
            updateData.supApprovedAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        else if(type === 'eng_assign') {
            const techType = document.querySelector('input[name="tech-type"]:checked').value;
            if(techType === 'internal') {
                if(!selectedTech) return toast("⚠️ اختر فني");
                updateData.status = 'at_tech'; updateData.technicianId = selectedTech.id; updateData.technicianName = selectedTech.name; updateData.techType = 'internal';
            } else {
                const name = document.getElementById('ext-name').value;
                if(!name) return toast("⚠️ ادخل اسم الفني");
                updateData.status = 'working'; updateData.technicianName = name + " (تعاقد)"; updateData.techType = 'external';
                updateData.extTechData = { name: name, phone: document.getElementById('ext-phone').value, company: document.getElementById('ext-company').value, cost: document.getElementById('ext-cost').value };
            }
            updateData.techAssignedAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        else if(type === 'tech_start') { 
            // === التعامل مع قرارات الفني ===
            const decision = document.querySelector('input[name="tech-action"]:checked')?.value;
            
            if (decision === 'accept') {
                updateData.status = 'working'; 
                updateData.workStartedAt = firebase.firestore.FieldValue.serverTimestamp(); 
            } else if (decision === 'reject') {
                if(!comment) { btn.disabled = false; return toast("⚠️ يرجى كتابة سبب الرفض"); }
                updateData.status = 'rejected'; 
                updateData.rejectedBy = userData.fullName;
                updateData.rejectionReason = comment;
            } else if (decision === 'transfer') {
                if(!selectedTech) { btn.disabled = false; return toast("⚠️ يرجى اختيار فني للتحويل"); }
                // تحديث البيانات للفني الجديد
                updateData.status = 'at_tech'; // تبقى الحالة "عند الفني"
                updateData.technicianId = selectedTech.id;
                updateData.technicianName = selectedTech.name;
                updateData.techType = 'internal';
                if(comment) updateData.transferNote = comment;
            }
        }
        else if(type === 'tech_finish') {
            updateData.status = 'pending_confirmation';
            updateData.techFinishedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            // 1. معالجة المواد المستخدمة (الخصم من المخزن)
            let finalUsedMaterials = [];
            let totalRequestCost = 0;

            // الكود الجديد (بيدعم العهدة والمشتريات الخارجية)
            for (const item of tempUsedItems) {
                if (item.type === 'inventory') {
                    // (أ) لو عهدة: خصم من المخزن وتسجيل حركة
                    const itemRef = db.collection('inventory').doc(item.id);
                    await itemRef.update({
                        current_qty: firebase.firestore.FieldValue.increment(-item.qty),
                        last_updated: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    await db.collection('inventory_logs').add({
                        item_id: item.id,
                        item_name: item.name,
                        action_type: "OUT",
                        quantity_change: item.qty,
                        price_snapshot: item.price,
                        total_cost: item.total,
                        date: new Date().toISOString().split('T')[0],
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        actor_name: userData.fullName,
                        ticket_id: tempActionData.id,
                        reference_info: "استخدام في صيانة"
                    });

                } else {
                    // (ب) لو شراء خارجي: حفظ في جدول المشتريات الخارجية
                    await db.collection('external_purchases').add({
                        item_name: item.name,
                        price: item.price,
                        qty: item.qty,
                        total_cost: item.total,
                        tech_name: userData.fullName,
                        tech_id: currentUser.uid,
                        ticket_id: tempActionData.id,
                        date: new Date().toISOString().split('T')[0],
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                // (ج) تجهيز البيانات للحفظ داخل البلاغ نفسه
                finalUsedMaterials.push({
                    name: item.name,
                    qty: item.qty,
                    price: item.price,
                    total: item.total,
                    type: item.type
                });
                
                totalRequestCost += item.total;
            }

            // حفظ قائمة المواد والتكلفة النهائية داخل وثيقة البلاغ
            if(finalUsedMaterials.length > 0) {
                updateData.usedMaterials = finalUsedMaterials;
                updateData.totalCost = totalRequestCost;
            }
        }
        else if(type === 'emp_confirm') { 
            updateData.status = 'done'; 
            updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp(); 
        }
        else if(type === 'emp_deny') { updateData.status = 'working'; updateData.notes = "رفض الموظف الاستلام: " + comment; }
        else if(type === 'reject') { updateData.status = 'rejected'; updateData.rejectedBy = userData.fullName; }

        await db.collection('requests').doc(id).update(updateData);
        toast("✅ تم تنفيذ الإجراء"); closeModal('action-modal');
    } catch(e) { console.error(e); toast("خطأ في النظام"); } 
    finally { btn.disabled = false; }
}

// --- Search & Utils ---
async function searchUser() {
    const q = document.getElementById('search-query').value.trim();
    const resDiv = document.getElementById('search-results');
    if(!q) return;
    resDiv.classList.remove('hidden'); resDiv.innerHTML = 'جاري البحث...';
    
    let users = [];
    let s1 = await db.collection('users').where('shortId','==',q).get();
    let s2 = await db.collection('users').where('email','==',q).get();
    s1.forEach(d=>users.push({id:d.id, ...d.data()}));
    s2.forEach(d=> { if(!users.find(u=>u.id===d.id)) users.push({id:d.id, ...d.data()}); });
    
    resDiv.innerHTML = "";
    if(users.length === 0) { resDiv.innerHTML = '<p style="text-align:center; color:#999; font-size:12px;">غير موجود</p>'; return; }
    users.forEach(u => {
        if(u.id === currentUser.uid) return;
        const roleMap = {'employee':'موظف', 'supervisor':'مشرف', 'technician':'فني', 'manager':'مدير', 'engineer': u.gender==='female'?'مهندسة':'مهندس'};
        resDiv.innerHTML += `<div style="display:flex; align-items:center; justify-content:space-between; padding:10px; background:var(--surface-light); border-radius:10px; margin-bottom:5px; border:1px solid var(--border);"><div style="display:flex; align-items:center; gap:10px;"><img src="${u.photoUrl}" style="width:35px; height:35px; border-radius:50%;"><div><b style="font-size:12px; color:var(--text);">${u.fullName}</b><br><span style="font-size:10px; color:var(--gold);">${roleMap[u.role]||u.role}</span></div></div><button onclick="addFriend('${u.id}', '${u.fullName}', '${u.photoUrl}')" class="btn-main btn-sm">إضافة +</button></div>`;
    });
}

async function addFriend(tid, tname, tpic) {
    await db.collection('friend_requests').add({ fromId: currentUser.uid, toId: tid, status: 'pending', fromData: { name: userData.fullName, pic: userData.photoUrl }, toData: { name: tname, pic: tpic } });
    toast("✅ تم إرسال الطلب");
}

async function loadTeam() {
    const list = document.getElementById('team-list'); list.innerHTML = "";
    const snap = await db.collection('users').doc(currentUser.uid).collection('friends').get();
    if(snap.empty) { list.innerHTML = "<p style='text-align:center; color:#999; font-size:12px;'>لا يوجد أصدقاء</p>"; return; }
    snap.forEach(d => { const f = d.data(); list.innerHTML += `<div class="friend-item" onclick="viewUserProfile('${f.friendId}')"><img src="${f.pic}" style="width:40px;height:40px;border-radius:50%;"><b>${f.name}</b></div>`; });
}

async function loadFriendReqs() {
    const div = document.getElementById('friend-reqs');
    const list = document.getElementById('reqs-list');
    const snap = await db.collection('friend_requests').where('toId','==',currentUser.uid).where('status','==','pending').get();
    if(snap.empty) { div.classList.add('hidden'); return; }
    div.classList.remove('hidden'); list.innerHTML = "";
    snap.forEach(d => {
        const r = d.data();
        list.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border-radius:10px; margin-bottom:5px;"><div style="display:flex; align-items:center; gap:10px;"><img src="${r.fromData.pic}" style="width:30px;height:30px;border-radius:50%;"><span>${r.fromData.name}</span></div><div><button onclick="acceptFriend('${d.id}', '${r.fromId}', '${r.fromData.name}', '${r.fromData.pic}')" class="btn-main btn-sm" style="background:var(--success);">قبول</button></div></div>`;
    });
}

async function acceptFriend(reqId, fid, fname, fpic) {
    await db.collection('users').doc(currentUser.uid).collection('friends').add({ friendId: fid, name: fname, pic: fpic });
    await db.collection('users').doc(fid).collection('friends').add({ friendId: currentUser.uid, name: userData.fullName, pic: userData.photoUrl });
    await db.collection('friend_requests').doc(reqId).delete();
    toast("✅ تم قبول الصداقة"); loadFriendReqs(); loadTeam();
}

function switchTab(tab, el) {
    currentTab = tab; 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    el.classList.add('active'); 
    renderFeed();
}

function getStatusLabel(s) {
    const map = { 'pending': 'في انتظار المشرف', 'at_engineer': 'عند المهندس', 'at_tech': 'عند الفني', 'working': 'قيد التنفيذ', 'pending_confirmation': 'بانتظار تأكيدك', 'done': 'مكتمل', 'rejected': 'مرفوض' };
    return map[s] || s;
}

// --- DETAILS MODAL (Updated: Async Phone Fetching) ---
async function openRequestDetails(id) {
    const d = requestsCache.find(r => r.id === id);
    // إظهار النافذة أولاً (يمكنك إضافة سبينر هنا إذا أردت، لكن البيانات ستظهر بسرعة)
    document.getElementById('request-details-modal').classList.remove('hidden');
    document.getElementById('req-details-content').innerHTML = '<div style="text-align:center;padding:20px;">جاري تحميل بيانات الفني والتفاصيل...</div>';

    // === منطق جلب رقم الهاتف ===
    let techPhone = "";
    let techName = d.technicianName || 'لم يتم تعيين فني';

    if (d.techType === 'external' && d.extTechData) {
        // إذا كان فني خارجي، الرقم موجود في البلاغ
        techPhone = d.extTechData.phone;
    } else if (d.technicianId) {
        // إذا كان فني داخلي، نجلب رقمه من جدول المستخدمين
        try {
            const userDoc = await db.collection('users').doc(d.technicianId).get();
            if(userDoc.exists) {
                techPhone = userDoc.data().phone || "";
            }
        } catch(e) { console.error("Error fetching tech phone", e); }
    }
    // تنسيق الرقم للواتساب (إزالة الصفر الأول وإضافة كود مصر 20)
    let whatsappLink = "#";
    let callLink = "#";
    if(techPhone) {
        callLink = `tel:${techPhone}`;
        let cleanPhone = techPhone.replace(/\D/g, ''); // أرقام فقط
        if(cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
        whatsappLink = `https://wa.me/20${cleanPhone}?text=${encodeURIComponent('بخصوص البلاغ رقم #' + toEng(d.uniqueCode))}`;
    }
    // ============================
    
    // Image Zoom Logic
    let mediaHtml = "";
    if(d.media) {
        d.media.forEach((m, idx) => {
            if(m.type === 'audio') mediaHtml += `<div class="media-item" onclick="openMediaViewer('${id}', ${idx})" style="background:#e0f2fe;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-play-circle fa-2x"></i></div>`;
            else mediaHtml += `<div class="media-item" onclick="openMediaViewer('${id}', ${idx})"><img src="${m.url}"></div>`;
        });
    }

    // Timeline Logic
    const t1 = formatDateTime(d.createdAt);
    const t2 = formatDateTime(d.supApprovedAt);
    const t3 = formatDateTime(d.techAssignedAt);
    const t4 = formatDateTime(d.workStartedAt);
    const t5 = formatDateTime(d.techFinishedAt);
    const t6 = formatDateTime(d.completedAt);

    let steps = [{ title: 'تم الإنشاء', detail: `${d.createdBy}`, time: t1.time + ' ' + t1.date, active: true }];
    let supActive = d.status !== 'pending' && d.status !== 'rejected';
    steps.push({ title: 'موافقة المشرف', detail: supActive ? 'تم' : '...', time: supActive ? t2.time : '', active: supActive });
    let engActive = ['at_tech', 'working', 'pending_confirmation', 'done'].includes(d.status);
    steps.push({ title: 'تعيين الفني', detail: engActive ? (d.engineerName || 'تم') : '...', time: engActive ? t3.time : '', active: engActive });
    let techWorking = ['working', 'pending_confirmation', 'done'].includes(d.status);
    steps.push({ title: 'بدء العمل', detail: d.technicianName || '...', time: techWorking ? t4.time : '', active: techWorking });
    let techFinished = ['pending_confirmation', 'done'].includes(d.status);
    steps.push({ title: 'تم الإصلاح', detail: techFinished ? 'بانتظار التأكيد' : '...', time: techFinished ? t5.time : '', active: techFinished });
    let empConfirmed = d.status === 'done';
    steps.push({ title: 'الإغلاق (الموظف)', detail: empConfirmed ? 'مكتمل' : '...', time: empConfirmed ? t6.time : '', active: empConfirmed });

    let tlHtml = '<div class="timeline">';
    if (d.status === 'rejected') {
          tlHtml += `<div class="timeline-item active rejected"><div class="tl-icon"><i class="fa-solid fa-xmark"></i></div><div class="tl-content"><h4>مرفوض</h4><span class="tl-detail">بواسطة: ${d.rejectedBy || 'غير محدد'}</span></div></div>`;
    } else {
        steps.forEach(step => {
            tlHtml += `
            <div class="timeline-item ${step.active ? 'active' : ''}">
                <div class="tl-icon"><i class="fa-solid fa-check"></i></div>
                <div class="tl-content">
                    <h4>${step.title}</h4>
                    <span class="tl-detail">${step.detail}</span>
                    ${step.time ? `<span class="tl-time en-num">${step.time}</span>` : ''}
                </div>
            </div>`;
        });
    }
    tlHtml += '</div>';
    
    let costHtml = '';
    if(d.usedMaterials && d.usedMaterials.length > 0) {
        costHtml = `<div style="background:#f8fafc; padding:15px; border-radius:12px; margin-top:15px; border:1px dashed var(--border);"><p style="font-weight:bold; color:var(--primary); font-size:12px; margin-bottom:10px;">المواد المستخدمة:</p><ul style="padding-right:20px; font-size:12px; margin:0;">${d.usedMaterials.map(m => `<li>${m.name} (<span class="en-num">${m.price}</span> ج.م)</li>`).join('')}</ul><p style="margin-top:10px; font-weight:bold; font-size:13px;">الإجمالي: <span class="en-num">${d.totalCost}</span> ج.م</p></div>`;
    }

    const locTable = `
    <table class="detail-table">
        <tr><td class="dt-label">الكلية/المبنى</td><td class="dt-val">${d.faculty || '-'}</td></tr>
        <tr><td class="dt-label">الدور</td><td class="dt-val">${d.floor || '-'}</td></tr>
        <tr><td class="dt-label">الغرفة/القاعة</td><td class="dt-val en-num">${d.room || '-'}</td></tr>
    </table>`;

    // === Complaint Admin Panel (Dynamic Phone) ===
    let complaintMgmtHtml = '';
    if (d.hasComplaint && (userData.role === 'manager' || userData.role === 'engineer')) {
        let btnDisabled = techPhone ? '' : 'style="opacity:0.5; pointer-events:none;"'; // تعطيل الأزرار إذا لم يوجد رقم
        let noPhoneMsg = techPhone ? '' : '<span style="font-size:10px; color:red; display:block; margin-top:5px;">⚠️ لا يوجد رقم هاتف مسجل لهذا الفني</span>';
        
        complaintMgmtHtml = `
        <div class="complaint-admin-panel">
            <div class="cp-title"><i class="fa-solid fa-gavel"></i> إدارة ومتابعة الشكوى</div>
            
            <div class="comm-grid">
                <a href="${callLink}" ${btnDisabled} class="btn-comm btn-call"><i class="fa-solid fa-phone"></i> اتصال بالفني</a>
                <a href="${whatsappLink}" target="_blank" ${btnDisabled} class="btn-comm btn-wsp"><i class="fa-brands fa-whatsapp"></i> واتساب</a>
            </div>
            ${noPhoneMsg}

            <div class="admin-memo-area">
                <label style="font-size:11px; font-weight:bold; margin-bottom:5px; display:block;">مذكرة إدارية (للاستخدام الداخلي):</label>
                <textarea id="memo-${d.id}" placeholder="اكتب ملاحظاتك أو القرار الإداري هنا...">${d.adminMemo || ''}</textarea>
                <button onclick="saveComplaintMemo('${d.id}')" class="btn-save-memo">حفظ المذكرة</button>
                <div style="clear:both;"></div>
            </div>
        </div>`;
    }
    // ============================================

    let responseTimeHtml = '';
    if(d.techAssignedAt && d.completedAt) {
        let diffMs = d.completedAt.seconds * 1000 - d.techAssignedAt.seconds * 1000;
        let hrs = Math.floor(diffMs / 3600000);
        let mins = Math.floor((diffMs % 3600000) / 60000);
        responseTimeHtml = `<div style="background:#ecfdf5; border:1px solid var(--success); color:#065f46; padding:10px; border-radius:12px; text-align:center; font-size:12px; margin-bottom:15px;">🚀 سرعة الاستجابة: <b class="en-num">${hrs}h ${mins}m</b></div>`;
    }

    document.getElementById('req-details-content').innerHTML = `
        ${complaintMgmtHtml}
        ${responseTimeHtml}
        ${tlHtml}
        <div style="text-align:center; margin-bottom:15px;"><span class="req-code en-num" style="font-size:16px;">#${toEng(d.uniqueCode||'---')}</span></div>
        <p style="font-size:12px; color:#666; margin-bottom:5px;"><strong>المنشئ:</strong> <span onclick="viewUserProfile('${d.userId}')" style="color:var(--primary); cursor:pointer;">${d.userData.fullName}</span> (ID: <span class="en-num">${toEng(d.userId.substring(0,5))}</span>)</p>
        <p><strong>الوصف:</strong> ${d.description}</p>
        ${locTable}
        ${getMaterialsHTML(d.usedMaterials, d.totalCost)}
        ${d.extTechData ? `<div style="background:#fff7ed;padding:10px;border-radius:10px;margin-top:10px;"><p style="margin:0;font-weight:bold;color:#c2410c;">فني خارجي:</p><p style="margin:0;font-size:12px;">${d.extTechData.name} - <span class="en-num">${d.extTechData.phone}</span></p></div>` : ''}
        ${costHtml}
        <div class="media-grid">${mediaHtml}</div>
    `;
}

// Image Zoom Handler
function openMediaViewer(reqId, startIndex) {
    const d = requestsCache.find(r => r.id === reqId);
    if(!d || !d.media) return;
    const content = document.getElementById('media-viewer-content');
    content.innerHTML = "";
    d.media.forEach(m => {
        if(m.type === 'video') content.innerHTML += `<video controls src="${m.url}" class="full-media-item" style="margin-bottom:15px;"></video>`;
        else if (m.type === 'audio') content.innerHTML += `<audio controls src="${m.url}" style="width:80%; margin-bottom:15px;"></audio>`;
        else content.innerHTML += `<img src="${m.url}" class="full-media-item" style="margin-bottom:15px; cursor:zoom-in;" onclick="this.style.transform = this.style.transform === 'scale(2)' ? 'scale(1)' : 'scale(2)'">`;
    });
    document.getElementById('media-viewer-modal').classList.remove('hidden');
}

async function softDelete(id) { openConfirmModal("نقل للمهملات؟", async () => { await db.collection('requests').doc(id).update({isDeleted:true}); toast("تم النقل"); }); }
async function hardDelete(id) { openConfirmModal("حذف نهائي؟ لا يمكن التراجع.", async () => { await db.collection('requests').doc(id).delete(); toast("تم الحذف"); }); }
async function restoreReq(id) { await db.collection('requests').doc(id).update({isDeleted:false}); toast("تم الاستعادة"); }

function openConfirmModal(msg, action) {
    document.getElementById('confirm-modal-msg').innerText = msg;
    document.getElementById('confirm-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-yes-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = function() { action(); closeModal('confirm-modal'); };
}

function loadProfilePageData() {
    document.getElementById('edit-current-pic').src = userData.photoUrl;
    document.getElementById('edit-id-display').innerText = toEng(userData.shortId);
    document.getElementById('edit-name').value = userData.fullName;
    document.getElementById('edit-job').value = userData.jobTitle;
    document.getElementById('edit-loc').value = userData.location;
    document.getElementById('edit-phone').value = toEng(userData.phone);
    document.getElementById('edit-gender').value = userData.gender;
}

async function saveProfile() {
    const newName = document.getElementById('edit-name').value;
    const newJob = document.getElementById('edit-job').value;
    const newLoc = document.getElementById('edit-loc').value;
    const newPhone = document.getElementById('edit-phone').value;
    const newGender = document.getElementById('edit-gender').value;
    let picUrl = userData.photoUrl;
    const btn = document.getElementById('save-profile-btn');
    btn.innerText = "جاري الحفظ..."; btn.disabled = true;

    if(newProfilePicFile) {
          const fd = new FormData(); fd.append('file', newProfilePicFile); fd.append('upload_preset', CLOUD_PRESET);
          const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {method:'POST', body:fd});
          const d = await res.json();
          picUrl = d.secure_url;
    }

    const selectedFrameEl = document.querySelector('.frame-option.selected');
    let frameClass = '';
    if(selectedFrameEl.classList.contains('f-gold')) frameClass = 'f-gold';
    if(selectedFrameEl.classList.contains('f-blue')) frameClass = 'f-blue';
    if(selectedFrameEl.classList.contains('f-grad')) frameClass = 'f-grad';

    await db.collection('users').doc(currentUser.uid).update({ fullName: newName, jobTitle: newJob, location: newLoc, phone: newPhone, gender: newGender, photoUrl: picUrl, frame: frameClass });
    toast("✅ تم تحديث الملف الشخصي"); btn.innerText = "حفظ التعديلات"; btn.disabled = false; location.reload(); 
}

function previewProfilePic(i) { newProfilePicFile = i.files[0]; document.getElementById('edit-current-pic').src = URL.createObjectURL(i.files[0]); }
function copyId() { navigator.clipboard.writeText(userData.shortId); toast("تم نسخ ID"); }
function selectFrame(el, c) { document.querySelectorAll('.frame-option').forEach(f=>f.classList.remove('selected')); el.classList.add('selected'); }

// --- Reports Logic ---
function generateReports() {
    let start = document.getElementById('report-start-date').valueAsDate;
    let end = document.getElementById('report-end-date').valueAsDate;
    if(!start) start = new Date(0); if(!end) end = new Date(); end.setHours(23, 59, 59);

    const reportData = requestsCache.filter(r => { const rDate = new Date(r.date); return rDate >= start && rDate <= end && r.isDeleted !== true; });
    const total = reportData.length;
    const done = reportData.filter(r => r.status === 'done').length;
    const rejected = reportData.filter(r => r.status === 'rejected').length;
    const active = total - done - rejected;
    const pHigh = reportData.filter(r => r.priority === 'high').length;
    const pMed = reportData.filter(r => r.priority === 'medium').length;
    const pLow = reportData.filter(r => r.priority === 'low').length;

    document.getElementById('rep-total').innerText = toEng(total); document.getElementById('rep-done').innerText = toEng(done);
    document.getElementById('rep-rejected').innerText = toEng(rejected); document.getElementById('rep-active').innerText = toEng(active);
    document.getElementById('rep-prio-high').innerText = toEng(pHigh); document.getElementById('rep-prio-med').innerText = toEng(pMed);
    document.getElementById('rep-prio-low').innerText = toEng(pLow);

    updateChart([done, active, rejected]); renderTechTable(reportData);
}

function updateChart(data) {
    if(reportChart) reportChart.destroy();
    const ctx = document.getElementById('statusChart').getContext('2d');
    reportChart = new Chart(ctx, { type: 'doughnut', data: { labels: ['مكتمل', 'قيد العمل', 'مرفوض'], datasets: [{ data: data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
}

function renderTechTable(data) {
    const tbody = document.getElementById('tech-performance-body'); tbody.innerHTML = "";
    const techs = {};
    data.forEach(r => { if(r.technicianName) { const name = r.technicianName; if(!techs[name]) techs[name] = { total: 0, done: 0, pic: 'https://cdn-icons-png.flaticon.com/512/3237/3237472.png' }; techs[name].total++; if(r.status === 'done') techs[name].done++; } });

    if(Object.keys(techs).length === 0) { tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>لا يوجد بيانات فنيين</td></tr>"; return; }

    for (const [name, stats] of Object.entries(techs)) {
        const efficiency = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
        let badgeColor = efficiency >= 80 ? 'green' : (efficiency >= 50 ? 'orange' : 'red');
        tbody.innerHTML += `<tr><td><div class="tech-row"><img src="${stats.pic}"><span>${name}</span></div></td><td style="text-align:center" class="en-num">${stats.total}</td><td style="text-align:center; color:var(--success); font-weight:bold;">${stats.done}</td><td style="text-align:center"><span class="en-num" style="color:${badgeColor}; font-weight:bold;">%${efficiency}</span></td></tr>`;
    }
}

function exportReportsPDF() {
    const element = document.getElementById('page-reports');
    const opt = { margin:0.5, filename:`report_${new Date().toISOString().slice(0,10)}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true}, jsPDF:{unit:'in',format:'a4',orientation:'portrait'} };
    html2pdf().set(opt).from(element).save();
}

// --- Feed Logic ---
function checkUnseenNotifications() {
    db.collection('posts').orderBy('createdAt', 'desc').limit(5).get().then(snap => {
        let hasUnseen = false;
        snap.forEach(doc => { const p = doc.data(); if(!p.seenBy || !p.seenBy.includes(currentUser.uid)) hasUnseen = true; });
        if(hasUnseen) document.getElementById('feed-badge').classList.add('active');
    });
}

function loadFeedPosts() {
    if(postsListener) return; 
    const container = document.getElementById('albayan-feed');
    container.innerHTML = '<div style="text-align:center; padding:20px;">جاري التحميل...</div>';

    postsListener = db.collection('posts').orderBy('createdAt', 'desc').limit(20)
        .onSnapshot(snap => {
            container.innerHTML = "";
            if(snap.empty) { container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">لا يوجد منشورات</div>'; return; }
            
            let hasUnseenInStream = false;
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const p = change.doc.data();
                    const now = new Date().getTime() / 1000;
                    if (p.createdAt && (now - p.createdAt.seconds) < 30 && p.authorId !== currentUser.uid) {
                          const audio = document.getElementById('sound-notify-post');
                          if(audio) audio.play().catch(e=>console.log("Audio block"));
                    }
                }
            });

            snap.forEach(doc => {
                const p = doc.data();
                if(!p.seenBy || !p.seenBy.includes(currentUser.uid)) { hasUnseenInStream = true; }
                renderPostItem(doc);
            });
            
            if(!document.getElementById('page-albayan').classList.contains('hidden')) { markPostsAsSeen(snap.docs); } 
            else if (hasUnseenInStream) { document.getElementById('feed-badge').classList.add('active'); }
        });
}

function renderPostItem(doc) {
    const p = doc.data(); const pid = doc.id;
    const container = document.getElementById('albayan-feed');
    const isLiked = p.likes && p.likes.includes(currentUser.uid);
    const likeIcon = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    const likeClass = isLiked ? 'liked' : '';
    const likeCount = p.likes ? p.likes.length : 0;
    const seenCount = p.seenBy ? p.seenBy.length : 0;
    const timeInfo = formatDateTime(p.createdAt); 
    
    let delBtn = '';
    if(p.authorId === currentUser.uid || userData.role === 'manager') delBtn = `<i class="fa-solid fa-trash" onclick="deletePost('${pid}')" style="cursor:pointer; color:var(--text-muted); font-size:12px;"></i>`;

    const html = `
    <div class="feed-post" id="post-${pid}">
        <div class="post-header">
            <div class="post-author" onclick="viewUserProfile('${p.authorId}')">
                <img src="${p.authorPic}">
                <div class="post-meta">
                    <h4>${p.authorName} <span style="font-weight:normal; font-size:10px; color:var(--primary);">(${p.role})</span></h4>
                    <span class="en-num" style="font-size:10px;">${timeInfo.date} - ${timeInfo.time}</span>
                </div>
            </div>
            ${delBtn}
        </div>
        <div class="post-body">${p.content}</div>
        <div class="post-actions">
            <div class="action-group">
                <button class="act-btn ${likeClass}" onclick="toggleLike('${pid}')"><i class="${likeIcon}"></i> <span class="en-num">${likeCount}</span></button>
                <button class="act-btn" onclick="toggleComments('${pid}')"><i class="fa-regular fa-comment"></i> تعليق</button>
            </div>
            <div class="seen-indicator" onclick="showSeenUsers('${pid}')"><i class="fa-solid fa-eye"></i> <span class="en-num">${seenCount}</span></div>
        </div>
        <div id="comments-${pid}" class="comments-section">
            <div id="comments-list-${pid}"></div>
            <div style="display:flex; gap:10px; margin-top:10px;">
                <input type="text" id="comment-input-${pid}" placeholder="اكتب تعليقاً..." style="padding:8px; border-radius:20px; font-size:12px;">
                <button onclick="addComment('${pid}')" class="btn-sm btn-main" style="width:auto;"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
        </div>
    </div>`;
    container.innerHTML += html;
}

async function createPost() {
    const content = document.getElementById('new-post-content').value.trim();
    if(!content) return;
    try {
        await db.collection('posts').add({
            content: content, authorId: currentUser.uid, authorName: userData.fullName, authorPic: userData.photoUrl,
            role: userData.role, createdAt: firebase.firestore.FieldValue.serverTimestamp(), likes: [], seenBy: [currentUser.uid]
        });
        document.getElementById('new-post-content').value = ""; toast("✅ تم النشر");
    } catch(e) { toast("خطأ في النشر"); }
}

async function deletePost(pid) { if(!confirm("حذف المنشور؟")) return; await db.collection('posts').doc(pid).delete(); toast("تم الحذف"); }

async function toggleLike(pid) {
    const postRef = db.collection('posts').doc(pid);
    const doc = await postRef.get();
    if(!doc.exists) return;
    const likes = doc.data().likes || [];
    if(likes.includes(currentUser.uid)) await postRef.update({ likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    else await postRef.update({ likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
}

function toggleComments(pid) {
    const sec = document.getElementById(`comments-${pid}`);
    sec.classList.toggle('show');
    if(sec.classList.contains('show')) loadComments(pid);
}

function loadComments(pid) {
    const list = document.getElementById(`comments-list-${pid}`);
    db.collection('posts').doc(pid).collection('comments').orderBy('createdAt', 'asc').onSnapshot(snap => {
        list.innerHTML = "";
        snap.forEach(d => {
            const c = d.data();
            const t = formatDateTime(c.createdAt); 
            let del = '';
            if(c.authorId === currentUser.uid || userData.role === 'manager') del = `<i class="fa-solid fa-xmark delete-comment" onclick="deleteComment('${pid}', '${d.id}')"></i>`;
            list.innerHTML += `
            <div class="comment-item">
                <img src="${c.authorPic}" onclick="viewUserProfile('${c.authorId}')">
                <div class="comment-box">
                    <span class="comment-name" onclick="viewUserProfile('${c.authorId}')">${c.authorName} <span class="en-num" style="font-size:9px;color:#999;font-weight:normal;">${t.time}</span></span>
                    <span class="comment-text">${c.text}</span>
                    <span class="reply-btn" onclick="prepareReply('${pid}', '${c.authorName}')">رد</span>
                    ${del}
                </div>
            </div>`;
        });
    });
}

function prepareReply(pid, name) { const input = document.getElementById(`comment-input-${pid}`); input.value = `@${name} `; input.focus(); }

async function addComment(pid) {
    const inp = document.getElementById(`comment-input-${pid}`);
    const text = inp.value.trim();
    if(!text) return;
    await db.collection('posts').doc(pid).collection('comments').add({
        text: text, authorId: currentUser.uid, authorName: userData.fullName, authorPic: userData.photoUrl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    inp.value = "";
}

async function deleteComment(pid, cid) { await db.collection('posts').doc(pid).collection('comments').doc(cid).delete(); }

async function markPostsAsSeen(docs) {
    docs.forEach(doc => {
        const p = doc.data();
        if(!p.seenBy || !p.seenBy.includes(currentUser.uid)) {
            db.collection('posts').doc(doc.id).update({ seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
        }
    });
}

async function showSeenUsers(pid) {
    const modal = document.getElementById('seen-users-modal');
    const list = document.getElementById('seen-users-list');
    list.innerHTML = "جاري التحميل...";
    modal.classList.remove('hidden');

    try {
        const postDoc = await db.collection('posts').doc(pid).get();
        const seenIds = postDoc.data().seenBy || [];
        if(seenIds.length === 0) { list.innerHTML = "<p style='text-align:center;color:#999'>لم يشاهده أحد بعد</p>"; return; }

        const usersSnap = await db.collection('users').get();
        list.innerHTML = "";
        let found = 0;
        usersSnap.forEach(uDoc => {
            if(seenIds.includes(uDoc.id)) {
                const u = uDoc.data();
                list.innerHTML += `<div class="seen-user-item" onclick="viewUserProfile('${uDoc.id}')"><img src="${u.photoUrl}"><span>${u.fullName}</span></div>`;
                found++;
            }
        });
        if(found === 0) list.innerHTML = "<p>بيانات غير متوفرة</p>";
    } catch(e) { list.innerHTML = "خطأ في التحميل"; }
}

async function viewUserProfile(uid) {
    if(uid === currentUser.uid) { nav('profile', document.querySelector('.nav-item:nth-child(5)')); return; }
    const modal = document.getElementById('friend-profile-modal');
    modal.classList.remove('hidden');
    document.getElementById('fp-name').innerText = "جاري التحميل...";
    const doc = await db.collection('users').doc(uid).get();
    if(doc.exists) {
        const u = doc.data();
        const roleMap = { 'employee': 'موظف', 'supervisor': 'مشرف', 'manager': 'مدير', 'technician': 'فني', 'engineer': 'مهندس' };
        document.getElementById('fp-pic').src = u.photoUrl;
        document.getElementById('fp-name').innerText = u.fullName;
        document.getElementById('fp-role').innerText = roleMap[u.role] || u.role;
        const infoDiv = document.getElementById('fp-info') || document.createElement('div');
        infoDiv.id = 'fp-info';
        infoDiv.style.marginTop = "15px"; infoDiv.style.color = "#666"; infoDiv.style.fontSize = "13px";
        infoDiv.innerHTML = `<p><i class="fa-solid fa-briefcase"></i> ${u.jobTitle || '-'}</p><p><i class="fa-solid fa-location-dot"></i> ${u.location || '-'}</p>`;
        const actionsDiv = document.getElementById('fp-actions');
        actionsDiv.innerHTML = "";
        const friendCheck = await db.collection('users').doc(currentUser.uid).collection('friends').where('friendId','==',uid).get();
        if(friendCheck.empty) {
            actionsDiv.innerHTML = `<button onclick="addFriend('${doc.id}', '${u.fullName}', '${u.photoUrl}')" class="btn-main btn-sm">إضافة صديق +</button>`;
        } else {
            actionsDiv.innerHTML = `<span style="color:green; font-weight:bold;"><i class="fa-solid fa-check"></i> صديق</span>`;
        }
    }
}

// --- Complaint System Logic (New Additions) ---
function openComplaintModal(id) {
    currentComplaintReqId = id;
    document.getElementById('complaint-text').value = "";
    document.getElementById('complaint-modal').classList.remove('hidden');
}

async function submitComplaint() {
    const text = document.getElementById('complaint-text').value.trim();
    if(!text) return toast("⚠️ اكتب تفاصيل الشكوى");
    
    const btn = document.getElementById('btn-submit-complaint');
    btn.disabled = true; btn.innerText = "جاري الإرسال...";

    try {
        await db.collection('requests').doc(currentComplaintReqId).update({
            hasComplaint: true,
            complaintData: {
                text: text,
                by: userData.fullName,
                byId: currentUser.uid,
                role: userData.role,
                at: firebase.firestore.FieldValue.serverTimestamp()
            }
        });
        toast("✅ تم رفع الشكوى للمدير والمهندس");
        closeModal('complaint-modal');
    } catch(e) {
        console.error(e);
        toast("❌ خطأ");
    } finally {
        btn.disabled = false; btn.innerText = "إرسال الشكوى";
    }
}

async function resolveComplaint(id) {
    if(!confirm("هل تم حل الشكوى؟ سيتم إزالتها من الصندوق.")) return;
    try {
        await db.collection('requests').doc(id).update({
            hasComplaint: false, // إزالة العلامة
            'complaintData.resolved': true,
            'complaintData.resolvedBy': userData.fullName
        });
        toast("✅ تم إغلاق الشكوى");
    } catch(e) { toast("خطأ"); }
}
// متغير لتخزين ID البلاغ المراد حله مؤقتاً
let currentResolveId = null;

function openResolveModal(id) {
    currentResolveId = id;
    document.getElementById('resolve-modal').classList.remove('hidden');
}

async function confirmResolve() {
    if(!currentResolveId) return;
    
    const btn = document.getElementById('btn-confirm-resolve');
    btn.disabled = true; btn.innerText = "جاري الإغلاق...";

    try {
        await db.collection('requests').doc(currentResolveId).update({
            hasComplaint: false, // إزالة العلامة
            'complaintData.resolved': true,
            'complaintData.resolvedBy': userData.fullName,
            'complaintData.resolvedAt': firebase.firestore.FieldValue.serverTimestamp()
        });
        toast("✅ تم إغلاق الشكوى بنجاح");
        closeModal('resolve-modal');
    } catch(e) { 
        console.error(e);
        toast("❌ حدث خطأ"); 
    } finally {
        btn.disabled = false; btn.innerText = "نعم، تم الحل";
        currentResolveId = null;
    }
}
// دالة تشغيل أيقونة العين لإظهار كلمة السر
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eye-icon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text'; // يظهر الأرقام
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash'); // يغير شكل العين لعين عليها خط
    } else {
        passwordInput.type = 'password'; // يخفي الأرقام
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye'); // يرجع العين عادية
    }
}
// ==========================================
// --- Inventory System Logic (نظام العهدة) ---
// ==========================================

function loadInventory() {
    // التأكد من الصلاحيات (اختياري - حسب رغبتك)
    // if(userData.role !== 'manager' && userData.role !== 'supervisor') return;

    const tbody = document.getElementById('inventory-table-body');
    if(!tbody) return; // حماية لو الجدول مش موجود في الصفحة
    
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">جاري تحميل العهد...</td></tr>';

    // الاستماع للتغييرات في قاعدة العهد
    db.collection('inventory').orderBy('created_at', 'desc').onSnapshot(snap => {
        inventoryCache = [];
        snap.forEach(doc => {
            inventoryCache.push({ id: doc.id, ...doc.data() });
        });
        renderInventoryTable(inventoryCache);
        
        // تحديث إحصائيات سريعة
        updateInventoryStats();
    });
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#999;">المخزن فارغ</td></tr>';
        return;
    }

    data.forEach(item => {
        // 1. حساب حالة المخزون (متوفر - منخفض - نفذ)
        let statusBadge = '<span class="status-pill st-done">متوفر</span>';
        let rowClass = '';
        
        if (item.current_qty === 0) {
            statusBadge = '<span class="status-pill st-rejected">نفذت الكمية</span>';
            rowClass = 'style="background:rgba(255,0,0,0.05);"';
        } else if (item.current_qty <= item.min_limit) {
            statusBadge = '<span class="status-pill st-working">منخفض</span>';
        }

        // 2. تجهيز الأزرار (الإجراءات)
        // زر "سجل الحركة" (العين) بيظهر للكل
        let actions = `
            <button onclick="viewItemHistory('${item.id}')" class="btn-ghost btn-sm" title="سجل الحركة" style="color:var(--primary);">
                <i class="fa-solid fa-eye"></i>
            </button>
        `;

        // زر "الحذف" بيظهر للمدير فقط
        if(userData.role === 'manager') {
            actions += `<button onclick="deleteInventoryItem('${item.id}')" class="btn-ghost btn-sm" title="حذف" style="color:var(--error); margin-right:5px;">
                <i class="fa-solid fa-trash"></i>
            </button>`;
        }

        // 3. بناء سطر الجدول
        // لاحظ استخدام toEng عشان الأرقام تظهر انجليزي لو حبيت، واستخدام formatDateTime للتاريخ
        const tr = `
        <tr ${rowClass}>
            <td><b class="en-num">${item.code}</b></td>
            <td>
                <div style="font-weight:bold;">${item.name}</div>
                <small style="color:#777; font-size:10px;">${item.category}</small>
            </td>
            <td>${item.unit}</td>
            <td class="en-num" style="font-weight:bold; font-size:15px;">${item.current_qty}</td>
            <td><span class="en-num">${item.price}</span> ج.م</td>
            <td>${statusBadge}</td>
            <td style="font-size:11px;">${formatDateTime(item.last_updated || item.created_at).date}</td>
            <td>
                ${actions}
            </td>
        </tr>`;
        
        tbody.innerHTML += tr;
    });
}

async function addNewInventoryItem() {
    // 1. تجميع البيانات
    const itemCode = document.getElementById('inv_item_code').value.trim();
    const itemName = document.getElementById('inv_item_name').value.trim();
    const category = document.getElementById('inv_category').value;
    const unit = document.getElementById('inv_unit').value;
    const minLimit = parseInt(document.getElementById('inv_min_limit').value) || 0;
    const initialQty = parseInt(document.getElementById('inv_initial_qty').value) || 0;
    const specs = document.getElementById('inv_specs').value;
    const price = parseFloat(document.getElementById('inv_price').value) || 0;

    // التحقق
    if (!itemCode || !itemName) return toast("⚠️ يرجى إدخال الكود واسم الصنف");

    const btn = document.querySelector('#inventoryForm button'); // زر الحفظ
    btn.disabled = true; btn.innerText = "جاري الحفظ...";

    try {
        // 2. تجهيز البيانات
        const newItemData = {
            code: itemCode,
            name: itemName,
            category: category,
            unit: unit,
            specs: specs,
            price: price,
            min_limit: minLimit,
            current_qty: initialQty,
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            last_updated: firebase.firestore.FieldValue.serverTimestamp(),
            created_by: userData.fullName, // اسم المستخدم الحالي
            search_keywords: [itemCode, itemName] // للبحث
        };

        // 3. الحفظ في قاعدة البيانات
        const docRef = await db.collection("inventory").add(newItemData);

        // 4. تسجيل حركة "رصيد افتتاحي" لو الكمية أكبر من صفر
        if (initialQty > 0) {
            await db.collection("inventory_logs").add({
                item_id: docRef.id,
                item_name: itemName,
                action_type: "IN",
                quantity_change: initialQty,
                price_snapshot: price,
                total_cost: initialQty * price,
                date: new Date().toISOString().split('T')[0],
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                actor_name: userData.fullName,
                reference_info: "رصيد افتتاحي",
                ticket_id: null
            });
        }

        toast("✅ تم إضافة الصنف للمخزن");
        
        // إعادة تعيين الفورم وإغلاق المودال لو حاطه في مودال
        document.getElementById('inventoryForm').reset();
        if(document.getElementById('add-inventory-modal')) closeModal('add-inventory-modal');

    } catch (error) {
        console.error(error);
        toast("❌ حدث خطأ أثناء الحفظ");
    } finally {
        btn.disabled = false; btn.innerText = "حفظ الصنف في المخزن";
    }
}
/**
 * دالة عرض سجل حركة صنف معين
 * @param {string} itemId - رقم تعريف الصنف في فيربيز
 */
async function viewItemHistory(itemId) {
    // 1. فتح المودال وعرض لودينج
    document.getElementById('item-history-modal').classList.remove('hidden');
    document.getElementById('item-history-body').innerHTML = '<tr><td colspan="5" style="text-align:center;">جاري تحميل البيانات...</td></tr>';

    // 2. جلب بيانات الصنف الأساسية (عشان الاسم والرصيد)
    const itemData = inventoryCache.find(i => i.id === itemId);
    if(itemData) {
        document.getElementById('hist-item-name').innerText = itemData.name;
        document.getElementById('hist-item-code').innerText = itemData.code;
        document.getElementById('hist-current-qty').innerText = itemData.current_qty;
    }

    // 3. جلب السجلات من inventory_logs
    try {
        const snap = await db.collection('inventory_logs')
                             .where('item_id', '==', itemId)
                             .orderBy('timestamp', 'desc') // الأحدث أولاً
                             .get();

        const tbody = document.getElementById('item-history-body');
        tbody.innerHTML = "";
        
        let totalOut = 0;

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد حركات مسجلة</td></tr>';
            return;
        }

        snap.forEach(doc => {
            const log = doc.data();
            const dateObj = formatDateTime(log.timestamp);
            
            // تحديد اللون والنوع (وارد ولا منصرف)
            let typeBadge = '';
            let rowColor = '';
            
            if (log.action_type === 'IN') {
                typeBadge = '<span style="color:green; font-weight:bold;">وارد (إضافة)</span>';
                rowColor = 'background:#f0fdf4;';
            } else {
                typeBadge = '<span style="color:red; font-weight:bold;">منصرف (سحب)</span>';
                rowColor = 'background:#fef2f2;';
                totalOut += parseInt(log.quantity_change);
            }

            // تحديد البيان (هل هو رصيد افتتاحي ولا بلاغ صيانة؟)
            let reason = log.reference_info || '-';
            if (log.ticket_id) {
                reason = `بلاغ صيانة <span class="en-num">#${log.ticket_id}</span>`;
            }

            tbody.innerHTML += `
            <tr style="${rowColor}">
                <td class="en-num">${dateObj.date} <br> <small>${dateObj.time}</small></td>
                <td>${typeBadge}</td>
                <td class="en-num" style="font-weight:bold; font-size:14px;">${log.quantity_change}</td>
                <td>${log.actor_name}</td>
                <td>${reason}</td>
            </tr>`;
        });

        document.getElementById('hist-total-out').innerText = totalOut;

    } catch (error) {
        console.error("Error fetching logs:", error);
        document.getElementById('item-history-body').innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">خطأ في تحميل السجل</td></tr>';
    }
}
async function deleteInventoryItem(id) {
    if(!confirm("هل أنت متأكد من حذف هذا الصنف وجميع سجلاته؟")) return;
    try {
        await db.collection('inventory').doc(id).delete();
        toast("🗑️ تم حذف الصنف");
    } catch(e) {
        toast("خطأ في الحذف");
    }
}

// دالة مساعدة لتحديث الأرقام فوق الجدول
function updateInventoryStats() {
    const totalItems = inventoryCache.length;
    const lowStock = inventoryCache.filter(i => i.current_qty <= i.min_limit && i.current_qty > 0).length;
    const outOfStock = inventoryCache.filter(i => i.current_qty === 0).length;
    
    // تأكد إن عندك Elements في HTML بال IDs دي
    if(document.getElementById('stat-total-items')) document.getElementById('stat-total-items').innerText = toEng(totalItems);
    if(document.getElementById('stat-low-stock')) document.getElementById('stat-low-stock').innerText = toEng(lowStock);
    if(document.getElementById('stat-out-stock')) document.getElementById('stat-out-stock').innerText = toEng(outOfStock);
}

// دالة البحث في الجدول
function searchInventory() {
    const q = document.getElementById('inv-search-input').value.toLowerCase();
    if(!q) {
        renderInventoryTable(inventoryCache);
        return;
    }
    const filtered = inventoryCache.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.code.toLowerCase().includes(q) ||
        item.category.includes(q)
    );
    renderInventoryTable(filtered);
}
// --- دالة طباعة تقرير الجرد (بالقيم المالية: أصلية وحالية) ---
async function printInventoryReport() {
    toast("⏳ جاري تحضير التقرير المالي...");

    try {
        // 1. جلب سجلات الاستهلاك
        const logsSnapshot = await db.collection('inventory_logs')
                                     .where('action_type', '==', 'OUT')
                                     .get();
        
        // 2. تجميع الاستهلاك
        const usageMap = {};
        logsSnapshot.forEach(doc => {
            const d = doc.data();
            usageMap[d.item_id] = (usageMap[d.item_id] || 0) + d.quantity_change;
        });

        // متغيرات لحساب إجمالي المخزن بالكامل (فلوس)
        let grandTotalOriginal = 0;
        let grandTotalCurrent = 0;

        // 3. تجهيز الصفوف والحسابات
        let tableRows = inventoryCache.map(item => {
            const used = usageMap[item.id] || 0;           // المستهلك
            const current = parseInt(item.current_qty) || 0;     // الحالي
            const original = current + used;               // الأصلي
            
            const price = parseFloat(item.price) || 0;
            const originalVal = original * price;          // قيمة الأصل (فلوس)
            const currentVal = current * price;            // قيمة الحالي (فلوس)

            // تجميع الإجماليات للكشف كله
            grandTotalOriginal += originalVal;
            grandTotalCurrent += currentVal;

            return `
            <tr>
                <td style="text-align:right; padding:5px; font-weight:bold;">${item.name}</td>
                <td style="text-align:center;">${price}</td>
                
                <td style="text-align:center; background:#f9f9f9;">${original}</td>
                <td style="text-align:center; background:#f0fdf4; font-weight:bold; color:#166534;">${originalVal.toLocaleString()}</td>
                
                <td style="text-align:center; color:#c2410c;">${used}</td>
                
                <td style="text-align:center; background:#f9f9f9;">${current}</td>
                <td style="text-align:center; background:#fff7ed; font-weight:bold; color:#c2410c;">${currentVal.toLocaleString()}</td>
            </tr>`;
        }).join('');

        // 4. فتح نافذة الطباعة
        const printWindow = window.open('', '', 'width=1100,height=700');
        printWindow.document.write(`
            <html dir="rtl">
            <head>
                <title>تقرير الجرد والقيم المالية</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
                    h2 { text-align: center; color: #333; margin-bottom: 5px; }
                    p { text-align: center; color: #666; margin-top: 0; font-size: 12px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                    th, td { border: 1px solid #ddd; padding: 6px; }
                    th { background-color: #333; color: #fff; text-align: center; }
                    .summary-box { display: flex; justify-content: space-around; margin-top: 30px; border-top: 2px solid #333; padding-top: 20px; }
                    .box { text-align: center; border: 1px solid #ddd; padding: 15px; border-radius: 8px; width: 40%; }
                    .box h3 { margin: 0 0 10px; font-size: 14px; color: #666; }
                    .box span { font-size: 20px; font-weight: bold; }
                    @media print { button { display: none; } .box { border: 1px solid #000; } }
                </style>
            </head>
            <body>
                <h2>📊 تقرير جرد المخزن (الكميات والقيم)</h2>
                <p>تاريخ التقرير: ${new Date().toLocaleString('ar-EG')}</p>
                
                <table>
                    <thead>
                        <tr>
                            <th rowspan="2" width="25%">الصنف</th>
                            <th rowspan="2">سعر الوحدة</th>
                            <th colspan="2" style="background:#166534;">الرصيد الأصلي</th>
                            <th rowspan="2" style="background:#777;">المستهلك</th>
                            <th colspan="2" style="background:#c2410c;">الرصيد الحالي</th>
                        </tr>
                        <tr>
                            <th style="background:#dcfce7; color:#000;">عدد</th>
                            <th style="background:#dcfce7; color:#000;">قيمة إجمالية</th>
                            
                            <th style="background:#ffedd5; color:#000;">عدد</th>
                            <th style="background:#ffedd5; color:#000;">قيمة إجمالية</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>

                <div class="summary-box">
                    <div class="box" style="background:#f0fdf4;">
                        <h3>💰 إجمالي قيمة "الأصل" (بداية المدة)</h3>
                        <span style="color:#166534;">${grandTotalOriginal.toLocaleString()} ج.م</span>
                    </div>
                    <div class="box" style="background:#fff7ed;">
                        <h3>💰 إجمالي قيمة "الحالي" (المخزن الآن)</h3>
                        <span style="color:#c2410c;">${grandTotalCurrent.toLocaleString()} ج.م</span>
                    </div>
                </div>

                <div style="margin-top:20px; text-align:center;">
                    <button onclick="window.print()" style="padding:10px 20px; cursor:pointer; font-size:16px; background:#333; color:#fff; border:none; border-radius:4px;">🖨️ طباعة التقرير</button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();

    } catch (error) {
        console.error("Error printing report:", error);
        toast("❌ حدث خطأ أثناء تحضير التقرير");
    }
}
// --- دوال واجهة الفني (العهد) ---

function searchInvForTech() {
    const q = document.getElementById('tech-inv-search').value.toLowerCase();
    const resDiv = document.getElementById('tech-inv-results');
    
    if(q.length < 1) { resDiv.classList.add('hidden'); return; }
    
    // البحث في الكاش (InventoryCache) اللي محملينه أصلاً
    const results = inventoryCache.filter(i => 
        (i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)) && i.current_qty > 0
    );

    resDiv.innerHTML = "";
    if(results.length === 0) {
        resDiv.innerHTML = "<div style='padding:10px; font-size:12px; color:#999;'>غير موجود بالمخزن</div>";
    } else {
        results.forEach(item => {
            resDiv.innerHTML += `
            <div onclick="selectInvItemForTech('${item.id}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; hover:bg-gray-50;">
                <div style="font-weight:bold; font-size:12px;">${item.name}</div>
                <div style="font-size:10px; color:#666; display:flex; justify-content:space-between;">
                    <span>كود: ${item.code}</span>
                    <span style="color:green;">متاح: ${item.current_qty}</span>
                </div>
            </div>`;
        });
    }
    resDiv.classList.remove('hidden');
}
// --- (1) دالة اختيار الصنف وفتح النافذة ---
function selectInvItemForTech(itemId) {
    const item = inventoryCache.find(i => i.id === itemId);
    if(!item) return;

    // تخزين الصنف عشان نعرف هنتعامل مع مين
    tempSelectedItem = item;

    // تحديث الكلام اللي في النافذة (الاسم والمتاح)
    document.getElementById('qty-item-name').innerText = item.name;
    document.getElementById('qty-available').innerText = item.current_qty;
    
    // تظبيط خانة الرقم (ترجع 1، والحد الأقصى هو المتاح)
    const input = document.getElementById('qty-input');
    input.value = 1; 
    input.max = item.current_qty; 

    // إظهار النافذة وإخفاء البحث
    document.getElementById('tech-inv-results').classList.add('hidden');
    document.getElementById('qty-modal').classList.remove('hidden');
    input.focus();
}

// --- (2) دالة زرار "تأكيد" اللي جوه النافذة ---
function confirmQtySelection() {
    if(!tempSelectedItem) return;

    const qtyVal = document.getElementById('qty-input').value;
    const qty = parseInt(qtyVal);
    const max = parseInt(tempSelectedItem.current_qty);

    // التأكد إن الرقم صح
    if(qty <= 0 || isNaN(qty)) return toast("⚠️ الكمية غير صحيحة");
    if(qty > max) return toast("⚠️ الكمية المطلوبة أكبر من المتاح بالمخزن");

    // إضافة الصنف لسلة الفني
    tempUsedItems.push({
        type: 'inventory',
        id: tempSelectedItem.id,
        name: tempSelectedItem.name,
        qty: qty,
        price: tempSelectedItem.price,
        total: qty * tempSelectedItem.price
    });

    // تحديث الجدول وإغلاق النافذة
    renderSelectedMaterials();
    closeModal('qty-modal');
    document.getElementById('tech-inv-search').value = "";
    
    // تنظيف الذاكرة المؤقتة
    tempSelectedItem = null;
}
function toggleManualItemForm() {
    document.getElementById('manual-item-form').classList.toggle('hidden');
}

function addManualItem() {
    const name = document.getElementById('man-item-name').value;
    const price = parseFloat(document.getElementById('man-item-price').value) || 0;
    const qty = parseInt(document.getElementById('man-item-qty').value) || 1;

    if(!name) return toast("⚠️ اكتب اسم الصنف");

    tempUsedItems.push({
        type: 'manual', // نوعه يدوي (لن يتخصم)
        name: name + " (شراء خارجي)",
        qty: qty,
        price: price,
        total: qty * price
    });

    renderSelectedMaterials();
    document.getElementById('man-item-name').value = "";
    document.getElementById('manual-item-form').classList.add('hidden');
}

function renderSelectedMaterials() {
    const list = document.getElementById('selected-materials-list');
    list.innerHTML = "";
    
    tempUsedItems.forEach((item, index) => {
        const badge = item.type === 'inventory' 
            ? '<span style="font-size:9px; background:#dcfce7; color:#166534; padding:2px 5px; border-radius:4px;">عهدة</span>' 
            : '<span style="font-size:9px; background:#fff7ed; color:#9a3412; padding:2px 5px; border-radius:4px;">يدوي</span>';

        list.innerHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:8px; border:1px solid #eee; border-radius:6px; margin-bottom:5px;">
            <div>
                <div style="font-size:12px; font-weight:bold;">${item.name} ${badge}</div>
                <div style="font-size:11px; color:#666;">${item.qty} × ${item.price} ج.م</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-weight:bold; font-size:12px;">${item.total} ج.م</span>
                <i class="fa-solid fa-times" onclick="removeTempItem(${index})" style="color:red; cursor:pointer;"></i>
            </div>
        </div>`;
    });
}

function removeTempItem(index) {
    tempUsedItems.splice(index, 1);
    renderSelectedMaterials();
}
function getMaterialsHTML(materials, totalCost) {
    if (!materials || materials.length === 0) return ''; // لو مفيش مواد مرجعش حاجة

    return `
    <div style="background:#f8fafc; padding:10px; border-radius:8px; margin-top:10px; border:1px solid #eee;">
        <h5 style="margin:0 0 10px; color:var(--primary); font-size:13px; border-bottom:1px solid #ddd; padding-bottom:5px;">
            <i class="fa-solid fa-screwdriver-wrench"></i> قطع الغيار والمواد:
        </h5>
        ${materials.map(m => {
            const isInv = m.type === 'inventory';
            const color = isInv ? '#166534' : '#c2410c'; 
            const bg = isInv ? '#dcfce7' : '#ffedd5';
            const label = isInv ? 'مخزن' : 'شراء خارجي';
            
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:6px; padding-bottom:4px; border-bottom:1px dashed #f1f1f1;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="background:${bg}; color:${color}; padding:2px 6px; border-radius:4px; font-size:10px;">${label}</span>
                    <span style="font-weight:bold; color:#333;">${m.name}</span>
                </div>
                <div>
                    <span style="color:#666;">${m.qty} x ${m.price}</span> = 
                    <span style="font-weight:bold; color:var(--primary);">${m.total} ج.م</span>
                </div>
            </div>`;
        }).join('')}
        
        <div style="margin-top:8px; padding-top:5px; border-top:2px solid #eee; text-align:left;">
            <span style="font-size:12px; color:#666;">الإجمالي الكلي:</span>
            <span style="font-size:14px; font-weight:bold; color:#000;">${totalCost || 0} ج.م</span>
        </div>
    </div>`;
}
// --- دالة عرض المشتريات الخارجية ---
async function openExternalPurchases() {
    const modal = document.getElementById('ext-purchases-modal');
    const tbody = document.getElementById('ext-purchases-table-body');
    
    if(!modal) return console.error("Modal not found!"); // لو النافذة مش موجودة ينبهنا

    // فتح المودال وعرض تحميل
    modal.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">جاري التحميل...</td></tr>';

    try {
        // جلب البيانات
        const snapshot = await db.collection('external_purchases')
                                 .orderBy('timestamp', 'desc')
                                 .limit(50)
                                 .get();

        tbody.innerHTML = ''; 

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">لا توجد سجلات حالياً</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const d = doc.data();
            tbody.innerHTML += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px; font-weight:bold;">${d.item_name}</td>
                <td>${d.qty}</td>
                <td>${d.price}</td>
                <td style="color:#c2410c; font-weight:bold;">${d.total_cost}</td>
                <td>${d.tech_name}</td>
                <td style="font-size:11px; color:#666;">
                    ${d.date}<br>
                    <span style="color:#aaa;">#${d.ticket_id ? d.ticket_id.substring(0,5) : '-'}</span>
                </td>
            </tr>`;
        });

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">حدث خطأ في التحميل</td></tr>';
    }
}
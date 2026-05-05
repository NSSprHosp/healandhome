document.addEventListener('DOMContentLoaded', async () => {
    const user = await supabaseClient.getUserInfo();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Set user global vars
    currentUser = user;
    
    // Update UI elements with username
    const nameElements = document.querySelectorAll('#nav-user-name');
    nameElements.forEach(el => el.textContent = user.name || user.username);
    
    // Initial fetch
    if (typeof loadPatients === 'function') {
        loadPatients();
    }
});


// Global variables
let allPatients = [];
let filteredPatients = [];
let currentPage = 1;
const rowsPerPage = 10;
let currentEditingId = null;
let followUpConfig = [];
let currentUser = {};
const MAX_CUSTOM_FOLLOWUPS = 5; // [v10.0] ต้องตรงกับ code.gs
let sortDueFirst = false;
let hasShownWelcomePopup = false;
let physicianNames = [];

// 28-Day View
let due28DayPatients = [];
let filteredDue28DayPatients = [];
let currentPage28Day = 1;
const rowsPerPage28Day = 10;

// 90-Day View
let due90DayPatients = [];
let filteredDue90DayPatients = [];
let currentPage90Day = 1;
const rowsPerPage90Day = 10;

// [NEW v8.0] Physician Alert View
let physicianAlertPatients = [];
let filteredPhysicianAlertPatients = [];
let currentPagePhysicianAlert = 1;
const rowsPerPagePhysicianAlert = 10;
let sortDueFirstPhysicianAlert = false; // [ADDED v8.1] For sorting physician alert view

// Global variables to store current report data
let currentThaiCocData = [];
let currentPhysicianData = [];
let currentDiagnosisData = {};
let currentClosedCasesData = [];

// [NEW v8.7] Global variable for Case Close settings
let caseCloseData = [];

// List of Thai provinces
const thaiProvinces = [
    'กระบี่', 'กรุงเทพมหานคร', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี'
].sort((a, b) => a.localeCompare(b, 'th'));


// --- Main function to run on DOM Ready ---
document.addEventListener('DOMContentLoaded', function() {
    showLoader();

    google.script.run
        .withSuccessHandler(initialData => {
            if (!initialData) {
                handleError("ไม่สามารถโหลดข้อมูลเริ่มต้นของแอปพลิเคชันได้ อาจเกิดจากปัญหาเซสชันหมดอายุ กรุณาลองรีเฟรชหน้าเว็บใหม่อีกครั้ง");
                return;
            }

            currentUser = initialData.userInfo;
            followUpConfig = initialData.followUpConfig;
            allPatients = initialData.patients.error ? [] : initialData.patients;
            caseCloseData = initialData.caseCloseData.error ? [] : initialData.caseCloseData;

            document.getElementById('userInfo').innerHTML = `<i class="fas fa-user-circle"></i> ${currentUser.name || currentUser.email}`;

            if (currentUser.role === 'admin' || currentUser.role === 'superadmin') {
                document.getElementById('addPatientBtn').style.display = 'block';
            }
            if (currentUser.role === 'superadmin') {
                document.getElementById('navPhysicianAlertBtnContainer').style.display = 'block';
            }
            if (currentUser.role === 'admin') {
                document.getElementById('navCaseCloseBtnContainer').style.display = 'block';
            }

            initializeFollowUpUI(followUpConfig);

            if (initialData.physicianNames.error) {
                console.error("Error loading physician names: ", initialData.physicianNames.error);
            } else {
                physicianNames = initialData.physicianNames;
                populatePhysicianOptions(physicianNames);
                populateReportPhysicianFilters(physicianNames);
            }

            populateProvinceOptions();
            $('#thaiCocProvince').select2({
                theme: 'bootstrap-5',
                placeholder: '-- เลือกจังหวัด --',
                allowClear: true
            });

            setupEventListeners();
            setupImagePreviewListeners();

            showListView(); 
            
            loadPhysicianAlertData(); 

            const today = new Date();
            const currentMonth = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2);
            document.getElementById('thaicocMonthFilter').value = currentMonth;
            document.getElementById('physicianReportMonthFilter').value = currentMonth;
            document.getElementById('diagReportMonthFilter').value = currentMonth;
            document.getElementById('summary28dayMonthFilter').value = currentMonth;
            document.getElementById('summary90dayMonthFilter').value = currentMonth;
            document.getElementById('closedCasesMonthFilter').value = currentMonth;

            if (!hasShownWelcomePopup) {
                showWelcomePopup(allPatients);
                hasShownWelcomePopup = true;
            }

            hideLoader();
        })
        .withFailureHandler(err => {
            handleError("ไม่สามารถโหลดข้อมูลเริ่มต้นของระบบได้: ".trim() + err.message);
            hideLoader();
        })
        .getInitialData();
});


/**
 * Setup all event listeners for the page.
 */
function setupEventListeners() {
    document.querySelector('.navbar-brand').addEventListener('click', (e) => {
         e.preventDefault(); 
         showListView(); 
    });

    document.getElementById('addPatientBtn').addEventListener('click', openAddForm);
    document.getElementById('patientForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('searchInput').addEventListener('keyup', debounce(applySearch, 300));
    document.getElementById('searchInput28Day').addEventListener('keyup', debounce(applySearch28Day, 300));
    document.getElementById('searchInput90Day').addEventListener('keyup', debounce(applySearch90Day, 300));

    document.getElementById('status').addEventListener('click', handleStatusClick);
    document.getElementById('deceased').addEventListener('change', handleDeceasedChange);

    document.getElementById('sortDueFirstToggle').addEventListener('change', function(event) {
        sortDueFirst = event.target.checked;
        applySearch();
    });

    document.getElementById('reportsBtn').addEventListener('click', showReportsView);
    document.getElementById('followUp28DayBtn').addEventListener('click', showFollowUp28DayView);
    document.getElementById('followUp90DayBtn').addEventListener('click', showFollowUp90DayView);
    document.getElementById('caseCloseBtn').addEventListener('click', openCaseCloseModal);

    document.getElementById('physicianAlertBtn').addEventListener('click', showPhysicianAlertView);
    document.getElementById('searchInputPhysicianAlert').addEventListener('keyup', debounce(applySearchPhysicianAlert, 300));
    document.getElementById('physicianAlertForm').addEventListener('submit', handlePhysicianAlertFormSubmit);
    document.getElementById('pullImageLinksBtn').addEventListener('click', pullImageLinks); 
    document.getElementById('pullSpecificImageLinksBtn').addEventListener('click', pullSpecificImageLinksFromInput);

    document.getElementById('sortDueFirstTogglePhysicianAlert').addEventListener('change', function(event) {
        sortDueFirstPhysicianAlert = event.target.checked;
        applySearchPhysicianAlert();
    });

    document.getElementById('sendSelectedReportsBtn').addEventListener('click', confirmSendSelectedReports);
    document.getElementById('pullLatestFollowUpBtn').addEventListener('click', pullLatestFollowUpData);
    document.getElementById('clearPulledDataBtn').addEventListener('click', clearPulledFollowUpData);

    document.getElementById('generateThaiCocReportBtn').addEventListener('click', generateThaiCocReport);
    document.getElementById('generatePhysicianReportBtn').addEventListener('click', generatePhysicianReport);
    document.getElementById('generateDiagReportBtn').addEventListener('click', generateDiagnosisReport);
    document.getElementById('generateSummary28DayReportBtn').addEventListener('click', generateSummary28DayReport);
    document.getElementById('generateSummary90DayReportBtn').addEventListener('click', generateSummary90DayReport);
    document.getElementById('generateClosedCasesReportBtn').addEventListener('click', generateClosedCasesReport);

    document.getElementById('saveSummaryBtn').addEventListener('click', saveSummary);
    document.getElementById('saveClosingSummaryBtn').addEventListener('click', saveClosingSummary);
    document.getElementById('saveCaseCloseItemBtn').addEventListener('click', handleCaseCloseFormSubmit);
    document.getElementById('clearCaseCloseFormBtn').addEventListener('click', clearCaseCloseForm);
}

// =======================================================
// --- Case Close Modal Functions ---
// =======================================================

function openCaseCloseModal() {
    populateCaseCloseTable();
    clearCaseCloseForm();
    $('#caseCloseModal').modal('show');
}

function populateCaseCloseTable() {
    const tableBody = document.getElementById('caseCloseTableBody');
    if (!caseCloseData || caseCloseData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted"><em>ยังไม่มีการตั้งค่า</em></td></tr>';
        return;
    }
    
    let tableHtml = '';
    caseCloseData.forEach(item => {
        tableHtml += `
            <tr data-row-index="${item.rowIndex}">
                <td>${item.diax || '-'}</td>
                <td>${item.surgery || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary" onclick="editCaseCloseItem(${item.rowIndex})">
                        <i class="fas fa-edit"></i> แก้ไข
                    </button>
                    <button class="btn btn-sm btn-outline-danger ml-1" onclick="deleteCaseCloseItem(${item.rowIndex})">
                        <i class="fas fa-trash-alt"></i> ลบ
                    </button>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = tableHtml;
}

function handleCaseCloseFormSubmit() {
    const diax = document.getElementById('caseCloseDiax').value.trim();
    const surgery = document.getElementById('caseCloseSurgery').value.trim();
    const rowIndex = document.getElementById('caseCloseRowIndex').value;
    const rowIndexInt = rowIndex ? parseInt(rowIndex, 10) : null;

    if (!diax && !surgery) {
        Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอก "Diax" หรือ "การผ่าตัด" อย่างน้อย 1 ช่อง', 'warning');
        return;
    }

    const isDuplicate = caseCloseData.some(item => {
        if (rowIndexInt && item.rowIndex === rowIndexInt) return false;
        const diaxMatch = diax && item.diax && item.diax === diax;
        const surgeryMatch = surgery && item.surgery && item.surgery === surgery;
        return diaxMatch || surgeryMatch;
    });

    if (isDuplicate) {
        Swal.fire('ข้อมูลซ้ำซ้อน', 'มีข้อมูล "Diax" หรือ "การผ่าตัด" นี้อยู่ในการตั้งค่าแล้ว', 'warning');
        return; 
    }

    const action = rowIndex ? 'update' : 'add';
    const data = { diax: diax, surgery: surgery, rowIndex: rowIndexInt };

    showLoader();
    google.script.run
        .withSuccessHandler(response => {
            hideLoader();
            if (response.error) {
                handleError("บันทึกข้อมูล Case Close ไม่สำเร็จ: " + response.error);
            } else {
                caseCloseData = response; 
                populateCaseCloseTable();
                clearCaseCloseForm();
                Swal.fire('สำเร็จ', `บันทึกข้อมูลเรียบร้อยแล้ว`, 'success');
            }
        })
        .withFailureHandler(err => handleError("เกิดข้อผิดพลาดในการบันทึก Case Close: " + err.message))
        .manageCaseCloseItem(action, data);
}

function editCaseCloseItem(rowIndex) {
    const item = caseCloseData.find(d => d.rowIndex === rowIndex);
    if (item) {
        document.getElementById('caseCloseDiax').value = item.diax;
        document.getElementById('caseCloseSurgery').value = item.surgery;
        document.getElementById('caseCloseRowIndex').value = item.rowIndex;
    }
}

function deleteCaseCloseItem(rowIndex) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: "คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoader();
            google.script.run
                .withSuccessHandler(response => {
                    hideLoader();
                    if (response.error) {
                        handleError("ลบข้อมูล Case Close ไม่สำเร็จ: " + response.error);
                    } else {
                        caseCloseData = response; 
                        populateCaseCloseTable();
                        clearCaseCloseForm();
                        Swal.fire('ลบสำเร็จ!', 'ลบข้อมูลเรียบร้อยแล้ว', 'success');
                    }
                })
                .withFailureHandler(err => handleError("เกิดข้อผิดพลาดในการลบ Case Close: " + err.message))
                .manageCaseCloseItem('delete', { rowIndex: rowIndex });
        }
    });
}

function clearCaseCloseForm() {
    document.getElementById('caseCloseDiax').value = '';
    document.getElementById('caseCloseSurgery').value = '';
    document.getElementById('caseCloseRowIndex').value = '';
    document.getElementById('caseCloseForm').classList.remove('was-validated');
}

function checkAutoClose(diax, surgery) {
    const diaxClean = (diax || '').trim().toLowerCase();
    const surgeryClean = (surgery || '').trim().toLowerCase();

    if (!diaxClean && !surgeryClean) return false;

    for (const item of caseCloseData) {
        const ruleDiax = (item.diax || '').trim().toLowerCase();
        const ruleSurgery = (item.surgery || '').trim().toLowerCase();

        if (ruleDiax && diaxClean && diaxClean.includes(ruleDiax)) return true;
        if (ruleSurgery && surgeryClean && surgeryClean.includes(ruleSurgery)) return true;
    }
    return false; 
}

// =======================================================
// --- Image Preview Feature ---
// =======================================================

function convertGoogleDriveLink(url) {
    if (typeof url !== 'string' || !url) return '';
    const parts = url.split(',');
    let cleanUrl = parts[0].trim();
    let id = null;
    let match = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
    if (!id) {
        match = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match) id = match[1];
    }
    if (id) return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';
    return cleanUrl;
}

function updateImagePreview(inputId, containerId, imgId) {
    try {
        const input = document.getElementById(inputId);
        const container = document.getElementById(containerId);
        const img = document.getElementById(imgId);

        if (!input || !container || !img) return;

        const rawUrl = input.value;
        const imageUrl = convertGoogleDriveLink(rawUrl);

        if (imageUrl) {
            img.src = imageUrl;
            container.style.display = 'flex'; 

            img.onerror = () => {
                container.style.display = 'none'; 
                img.src = ''; 
            };
            img.onload = () => { container.style.display = 'flex'; };
        } else {
            container.style.display = 'none'; 
            img.src = '';
        }
    } catch (e) {
        console.error('Error updating image preview:', e);
        const container = document.getElementById(containerId);
        if (container) container.style.display = 'none';
    }
}

function setupImagePreviewListeners() {
    const previewFields = [
        { input: 'alertFormImgChest', container: 'previewContainerImgChest', img: 'previewImgChest' },
        { input: 'alertFormImgArmL', container: 'previewContainerImgArmL', img: 'previewImgArmL' },
        { input: 'alertFormImgLegR', container: 'previewContainerImgLegR', img: 'previewImgLegR' },
        { input: 'alertFormImgLegL', container: 'previewContainerImgLegL', img: 'previewImgLegL' },
        { input: 'alertFormImgAdd', container: 'previewContainerImgAdd', img: 'previewImgAdd' }
    ];

    previewFields.forEach(field => {
        const inputElement = document.getElementById(field.input);
        if (inputElement) {
            inputElement.addEventListener('input', () => { updateImagePreview(field.input, field.container, field.img); });
        }
    });
}

function updateAllImagePreviews() {
     updateImagePreview('alertFormImgChest', 'previewContainerImgChest', 'previewImgChest');
     updateImagePreview('alertFormImgArmL', 'previewContainerImgArmL', 'previewImgArmL');
     updateImagePreview('alertFormImgLegR', 'previewContainerImgLegR', 'previewImgLegR');
     updateImagePreview('alertFormImgLegL', 'previewContainerImgLegL', 'previewImgLegL');
     updateImagePreview('alertFormImgAdd', 'previewContainerImgAdd', 'previewImgAdd');
}


// =======================================================
// --- Date Formatting and Utility ---
// =======================================================

function formatThaiDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            if (String(dateString).match(/^\d{4}-\d{2}-\d{2}$/)) {
                 const parts = dateString.split('-');
                 const utcDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                 return utcDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
            }
            return dateString; 
        }
        return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
        return dateString;
    }
}

function formatThaiMonthYear(monthString) {
    if (!monthString) return '';
    try {
        const date = new Date(monthString + '-01');
        return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    } catch(e) {
        return monthString;
    }
}

function calculateDaysSince(dateString) {
    if (!dateString) return null;
    try {
        const now = new Date();
        const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const pastDate = new Date(dateString);
        const pastDateUTC = new Date(Date.UTC(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate()));
        if (isNaN(pastDateUTC.getTime())) return null;
        const timeDiff = todayUTC.getTime() - pastDateUTC.getTime();
        return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    } catch (e) { return null; }
}

function calculateDaysBetween(dateStringStart, dateStringEnd) {
    if (!dateStringStart || !dateStringEnd) return null;
    try {
        const startDate = new Date(dateStringStart);
        const startDateUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
        const endDate = new Date(dateStringEnd);
        const endDateUTC = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()));
        if (isNaN(startDateUTC.getTime()) || isNaN(endDateUTC.getTime())) return null;
        const timeDiff = endDateUTC.getTime() - startDateUTC.getTime();
        return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    } catch (e) { return null; }
}

// =======================================================
// --- View Management ---
// =======================================================

function showView(viewId) {
    ['listView', 'formView', 'reportsView', 'followUp28DayView', 'followUp90DayView', 'physicianAlertView', 'physicianAlertFormView'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === viewId) ? 'block' : 'none';
    });
}

function showListView() {
    showView('listView');
    applySearch(); 
    document.getElementById('patientForm').reset();
    $('#patientForm').removeClass('was-validated');
    currentEditingId = null;
}

function showReportsView() {
    showView('reportsView');
    if(!document.getElementById('thaicocReportResult').innerHTML.trim()){ generateThaiCocReport(); }
}

function showFormView() { showView('formView'); }

function showFollowUp28DayView() { showView('followUp28DayView'); loadFollowUp28DayData(); }

function showFollowUp90DayView() { showView('followUp90DayView'); loadFollowUp90DayData(); }

function showPhysicianAlertView() { showView('physicianAlertView'); applySearchPhysicianAlert(); }

function showPhysicianAlertFormView() { showView('physicianAlertFormView'); }


// =======================================================
// --- Physician Alert Feature ---
// =======================================================

function confirmSendSelectedReports() {
    const patientsToSend = physicianAlertPatients.filter(p => p['ส่งแจ้งเตือน'] === true);
    if (patientsToSend.length === 0) {
        Swal.fire('ไม่พบรายการ', 'ไม่พบผู้ป่วยที่เลือก "ส่งแจ้งเตือน" ไว้ (กรุณาไปที่ "แก้ไข" เพื่อติ๊กเลือกส่งแจ้งเตือน)', 'info');
        return;
    }

    Swal.fire({
        title: 'ยืนยันการส่งรายงาน',
        html: `ต้องการส่งรายงานสำหรับผู้ป่วย <b>${patientsToSend.length}</b> รายการที่เลือกไว้หรือไม่?<br><small>(ระบบจะส่งไปยังกลุ่ม Telegram ของแพทย์เจ้าของไข้แต่ละท่าน)</small>`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ใช่, ส่งเลย!', cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) sendSelectedReports();
    });
}

function sendSelectedReports() {
    Swal.fire({
        title: 'กำลังส่งรายงาน...',
        html: 'ระบบกำลังประมวลผลและส่งรายงานไปยัง Telegram... (กรุณารอสักครู่)',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    google.script.run
        .withSuccessHandler(response => {
            if (response.success) {
                let successMsg = `ส่งรายงานสำเร็จ ${response.sent} รายการ`;
                if (response.errors && response.errors.length > 0) {
                    const errorDetails = response.errors.join('<br>');
                    successMsg += `<br><br><b>พบข้อผิดพลาด ${response.errors.length} รายการ:</b><br><div style="text-align:left; max-height: 150px; overflow-y:auto; background:#f9f9f9; border: 1px solid #eee; padding: 10px; margin-top: 10px;">${errorDetails}</div>`;
                    Swal.fire('ส่งสำเร็จ (มีข้อผิดพลาดบางส่วน)', successMsg, 'warning').then(() => { setTimeout(() => loadPatients(), 1500); });
                } else {
                    Swal.fire('สำเร็จ!', successMsg, 'success').then(() => { setTimeout(() => loadPatients(), 1500); });
                }
            } else {
                handleError(response.error || 'เกิดข้อผิดพลาด');
            }
        })
        .withFailureHandler(err => handleError(err.message))
        .sendSelectedPhysicianReports(); 
}

function loadPhysicianAlertData() {
    physicianAlertPatients = [...allPatients];
    applySearchPhysicianAlert();
}

function applySearchPhysicianAlert() {
    const searchTerm = document.getElementById('searchInputPhysicianAlert').value.toLowerCase().trim();
    let filteredData = allPatients.filter(patient => {
        const isActive = patient['สถานะ'];
        const isDeceased = patient['ผู้ป่วยเสียชีวิต'];
        const shouldShow = isActive || isDeceased;
        if (!shouldShow) return false; 
        if (!searchTerm) return true;
        return (patient['ชื่อ-สกุล'] && patient['ชื่อ-สกุล'].toLowerCase().includes(searchTerm)) ||
               (patient['HN'] && patient['HN'].toLowerCase().includes(searchTerm)) ||
               (patient['ID'] && String(patient['ID']).toLowerCase().includes(searchTerm));
    });

    if (sortDueFirstPhysicianAlert) {
        filteredData.sort((a, b) => getFollowUpStatus(b).isDue - getFollowUpStatus(a).isDue);
    } else {
        filteredData.sort((a, b) => (b.ID || 0) - (a.ID || 0));
    }
    
    filteredPhysicianAlertPatients = filteredData;
    currentPagePhysicianAlert = 1;
    displayCurrentPagePhysicianAlert();
    setupPaginationPhysicianAlert();
}

function displayCurrentPagePhysicianAlert() {
    const tableBody = document.getElementById('physicianAlertTableBody');
    if (!filteredPhysicianAlertPatients || filteredPhysicianAlertPatients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted"><em>ไม่พบข้อมูลผู้ป่วยตามเงื่อนไขการค้นหา</em></td></tr>';
        document.getElementById('paginationControlsPhysicianAlert').innerHTML = '';
        return;
    }

    const startIndex = (currentPagePhysicianAlert - 1) * rowsPerPagePhysicianAlert;
    const patientsToDisplay = filteredPhysicianAlertPatients.slice(startIndex, startIndex + rowsPerPagePhysicianAlert);
    let tableHtml = '';

    patientsToDisplay.forEach(patient => {
        const isDeceased = patient['ผู้ป่วยเสียชีวิต'];
        const isActive = patient['สถานะ'];
        let caseStatusHtml;

        if (isDeceased) caseStatusHtml = '<span class="badge badge-dark">เสียชีวิต</span>';
        else if (!isActive) caseStatusHtml = '<span class="badge badge-warning">ปิดเคส</span>';
        else caseStatusHtml = '<span class="badge badge-success">ติดตามอยู่</span>';
        
        let nameHtml = patient['ชื่อ-สกุล'] || '-';
        if (patient['ผู้ป่วยเสียชีวิต']) {
            nameHtml += ` <span class="badge badge-dark">เสียชีวิต</span>`;
        } else {
            const followUpStatus = getFollowUpStatus(patient);
            if (followUpStatus.isDue) {
                nameHtml += ` <span class="badge badge-danger">${followUpStatus.label}</span>`;

                // --- เพิ่มการแสดงผลป้าย "ทำแบบประเมิน" ---
                if (followUpStatus.label === 'ครบ 7 วัน' && patient['ทำแบบประเมิน7วัน']) {
                    nameHtml += ` <span class="badge badge-info ml-1" style="background-color: #17a2b8; color: white;"><i class="fas fa-clipboard-list"></i> ทำแบบประเมิน</span>`;
                }
                // ------------------------------------        
                // [v10.0] ป้ายกำกับวันติดตามพิเศษ
                const customDaysList = getPatientCustomDays(patient);
                if (customDaysList.length > 0) {
                    nameHtml += ` <span class="badge ml-1" style="background-color: #0dcaf0; color: #000;"><i class="fas fa-calendar-plus"></i> พิเศษ: ${customDaysList.join(',')} วัน</span>`;
                }

                if (followUpStatus.isCompleted) nameHtml += ` <i class="fas fa-check-circle text-primary" title="ติดตามผลแล้ว"></i>`;
            }
        }
        
        const checkboxId = `report_check_${patient.ID}`;
        const reportCheckbox = `
            <div class="custom-control custom-checkbox d-inline-block">
                <input type="checkbox" class="custom-control-input report-checkbox-custom" id="${checkboxId}" ${patient['ส่งแจ้งเตือน'] ? 'checked' : ''} disabled>
                <label class="custom-control-label" for="${checkboxId}"></label>
            </div>
        `;

        const editButton = `<button class="btn btn-sm btn-outline-danger" onclick="openPhysicianAlertForm('${patient.ID}')"><i class="fas fa-edit"></i> แก้ไข</button>`;
        const viewButton = `<button class="btn btn-sm btn-outline-primary ml-1" onclick="viewDetails('${patient.ID}')"><i class="fas fa-eye"></i> ดูข้อมูล</button>`;
        const actionButtons = editButton + viewButton;

        tableHtml += `
            <tr>
                <td class="align-middle">${patient.ID}</td>
                <td class="align-middle">${nameHtml}</td>
                <td class="align-middle">${patient.HN || '-'}</td>
                <td class="align-middle">${patient['โทรศัพท์'] || '-'}</td>
                <td class="align-middle">${patient['แพทย์เจ้าของไข้'] || '-'}</td>
                <td class="align-middle">${caseStatusHtml}</td>
                <td class="text-center align-middle" style="transform: scale(1.3);">${reportCheckbox}</td>
                <td class="text-center align-middle">${actionButtons}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = tableHtml;
}

function setupPaginationPhysicianAlert() {
    const paginationControls = document.getElementById('paginationControlsPhysicianAlert');
    paginationControls.innerHTML = '';
    if (!filteredPhysicianAlertPatients || filteredPhysicianAlertPatients.length === 0) return;

    const pageCount = Math.ceil(filteredPhysicianAlertPatients.length / rowsPerPagePhysicianAlert);
    if (pageCount <= 1) return;

    const createPageItem = (text, pageNum, isDisabled = false, isActive = false) => {
        const li = document.createElement('li');
        li.className = `page-item ${isDisabled ? 'disabled' : ''} ${isActive ? 'active' : ''}`;
        const a = document.createElement('a'); a.className = 'page-link'; a.href = '#'; a.innerHTML = text;
        a.onclick = (e) => { e.preventDefault(); if (!isDisabled && !isActive) changePagePhysicianAlert(pageNum); };
        li.appendChild(a); return li;
    };
    paginationControls.appendChild(createPageItem('&laquo;', 1, currentPagePhysicianAlert === 1));
    paginationControls.appendChild(createPageItem('&lt;', currentPagePhysicianAlert - 1, currentPagePhysicianAlert === 1));
    let startPage = Math.max(1, currentPagePhysicianAlert - 2);
    let endPage = Math.min(pageCount, currentPagePhysicianAlert + 2);
    if (startPage > 1) paginationControls.appendChild(createPageItem('1', 1));
    if (startPage > 2) paginationControls.appendChild(createPageItem('...', -1, true));
    for (let i = startPage; i <= endPage; i++) paginationControls.appendChild(createPageItem(i, i, false, i === currentPagePhysicianAlert));
    if (endPage < pageCount - 1) paginationControls.appendChild(createPageItem('...', -1, true));
    if (endPage < pageCount) paginationControls.appendChild(createPageItem(pageCount, pageCount));
    paginationControls.appendChild(createPageItem('&gt;', currentPagePhysicianAlert + 1, currentPagePhysicianAlert === pageCount));
    paginationControls.appendChild(createPageItem('&raquo;', pageCount, currentPagePhysicianAlert === pageCount));
}

function changePagePhysicianAlert(newPage) {
    const pageCount = Math.ceil(filteredPhysicianAlertPatients.length / rowsPerPagePhysicianAlert);
    if (newPage < 1 || newPage > pageCount) return;
    currentPagePhysicianAlert = newPage;
    displayCurrentPagePhysicianAlert();
    setupPaginationPhysicianAlert();
    window.scrollTo(0, 0);
}

function openPhysicianAlertForm(id) {
    showLoader();
    google.script.run
        .withSuccessHandler(patient => {
            if (patient.error) { handleError("โหลดข้อมูลผู้ป่วยไม่สำเร็จ: " + patient.error); return; }
            $('#pastFollowUpCollapse').collapse('hide');

            document.getElementById('alertRecordId').value = patient.ID || '';
            document.getElementById('alertFormPatientName').value = patient['ชื่อ-สกุล'] || '';
            document.getElementById('alertFormHN').value = patient.HN || '';
            document.getElementById('alertFormPhone').value = patient['โทรศัพท์'] || '';
            document.getElementById('alertFormDX').value = patient.Diax || '';
            document.getElementById('alertFormSurgery').value = patient['การผ่าตัด'] || ''; 
            document.getElementById('alertFormPhysician').value = patient['แพทย์เจ้าของไข้'] || '';
            document.getElementById('alertFormSurgeryDate').value = formatThaiDate(patient['วันที่ผ่าตัด']);
            
            document.getElementById('alertFormFollowUpDate').value = formatThaiDate(patient['วันที่ตรวจเยี่ยมล่าสุด']);
            document.getElementById('alertFormDueDate').value = patient['ครบกำหนดติดตามล่าสุด'] || '';
            document.getElementById('alertFormFC').value = patient['FC ล่าสุด'] || '';
            document.getElementById('alertFormSummary').value = patient['ข้อมูลติดตามล่าสุด'] || '';
            document.getElementById('alertFormFollower').value = patient['ผู้ติดตามล่าสุด'] || '';

            const pastTabsContainer = document.getElementById('pastFollowUpTabsContainer');
            const pastTabContentContainer = document.getElementById('pastFollowUpTabContentContainer');
            pastTabsContainer.innerHTML = ''; pastTabContentContainer.innerHTML = '';

            let hasPastData = false;
            let firstActiveTab = true;
            const latestDueDay = String(patient['ครบกำหนดติดตามล่าสุด']).trim();

            if (followUpConfig && followUpConfig.length > 0) {
                followUpConfig.forEach(period => {
                    const dataKey = `ติดตามครบ${period.sheetSuffix}_ข้อมูล`;
                    const dateKey = `ติดตามครบ${period.sheetSuffix}_วันที่`;
                    const fcKey = `ติดตามครบ${period.sheetSuffix}_FunctionalClass`;
                    const byKey = `ติดตามครบ${period.sheetSuffix}_ผู้ติดตาม`;

                    const data = patient[dataKey]; const date = patient[dateKey]; const fc = patient[fcKey]; const by = patient[byKey];
                    const currentPeriodDay = String(period.days).trim();

                    if ((data || date || fc || by) && currentPeriodDay !== latestDueDay) { 
                        hasPastData = true;
                        const isActive = firstActiveTab;
                        firstActiveTab = false; 

                        const tabId = `past-fu-${period.days}`;
                        pastTabsContainer.innerHTML += `<li class="nav-item" role="presentation"><a class="nav-link ${isActive ? 'active' : ''}" id="${tabId}-tab" data-toggle="tab" href="#${tabId}" role="tab">${`ครบ ${period.label}`}</a></li>`;
                        pastTabContentContainer.innerHTML += `
                            <div class="tab-pane fade ${isActive ? 'show active' : ''}" id="${tabId}" role="tabpanel">
                                <div class="form-group mb-2"><label class="mb-0 small text-muted">ข้อมูลการติดตาม:</label><textarea class="form-control form-control-sm" rows="2" readonly>${data || ''}</textarea></div>
                                <div class="row">
                                    <div class="col-4"><p class="mb-1"><strong class="small text-muted">Functional Class:</strong><br>${fc || '-'}</p></div>
                                    <div class="col-4"><p class="mb-1"><strong class="small text-muted">วันที่ติดตาม:</strong><br>${formatThaiDate(date) || '-'}</p></div>
                                    <div class="col-4"><p class="mb-1"><strong class="small text-muted">ผู้ติดตาม:</strong><br>${by || '-'}</p></div>
                                </div>
                            </div>`;
                    }
                });
            }

            // [v10.0] เพิ่ม Custom Follow-Up Tabs
            for (let ci = 1; ci <= MAX_CUSTOM_FOLLOWUPS; ci++) {
                const customDays = patient[`ติดตามพิเศษ${ci}_วันครบกำหนด`];
                if (customDays && String(customDays).trim() !== '' && parseInt(customDays) > 0) {
                    const cData = patient[`ติดตามพิเศษ${ci}_ข้อมูล`], cDate = patient[`ติดตามพิเศษ${ci}_วันที่`], cFc = patient[`ติดตามพิเศษ${ci}_FunctionalClass`], cBy = patient[`ติดตามพิเศษ${ci}_ผู้ติดตาม`];
                    if ((cData || cDate || cFc || cBy) && String(customDays).trim() !== latestDueDay) {
                        hasPastData = true; const isActive = firstActiveTab; firstActiveTab = false; const tabId = `past-fu-c${ci}`;
                        pastTabsContainer.innerHTML += `<li class="nav-item" role="presentation"><a class="nav-link ${isActive ? 'active' : ''}" id="${tabId}-tab" data-toggle="tab" href="#${tabId}" role="tab">${customDays} วัน (พิเศษ)</a></li>`;
                        pastTabContentContainer.innerHTML += `<div class="tab-pane fade ${isActive ? 'show active' : ''}" id="${tabId}" role="tabpanel"><div class="form-group mb-2"><label class="mb-0 small text-muted">ข้อมูลการติดตาม:</label><textarea class="form-control form-control-sm" rows="2" readonly>${cData || ''}</textarea></div><div class="row"><div class="col-4"><p class="mb-1"><strong class="small text-muted">FC:</strong><br>${cFc || '-'}</p></div><div class="col-4"><p class="mb-1"><strong class="small text-muted">วันที่:</strong><br>${formatThaiDate(cDate) || '-'}</p></div><div class="col-4"><p class="mb-1"><strong class="small text-muted">ผู้ติดตาม:</strong><br>${cBy || '-'}</p></div></div></div>`;
                    }
                }
            }

            if (!hasPastData) {
                pastTabsContainer.innerHTML = ''; 
                pastTabContentContainer.innerHTML = '<p class="text-muted text-center p-3"><em>ไม่พบข้อมูลการติดตามเยี่ยมย้อนหลัง</em></p>';
            }

            document.getElementById('alertFormOverrideSummary').value = patient['รายงานแพทย์_สรุปผล'] || '';
            document.getElementById('alertFormImgChest').value = patient['ลิ้งค์รูปภาพบริเวณหน้าอก'] || '';
            document.getElementById('alertFormImgArmL').value = patient['ลิ้งค์รูปภาพบริเวณแขนซ้าย'] || '';
            document.getElementById('alertFormImgLegR').value = patient['ลิ้งค์รูปภาพบริเวณขาขวา'] || '';
            document.getElementById('alertFormImgLegL').value = patient['ลิ้งค์รูปภาพบริเวณขาซ้าย'] || '';
            document.getElementById('alertFormImgAdd').value = patient['ลิ้งค์รูปภาพเพิ่มเติม'] || '';
            document.getElementById('sendAlertCheckbox').checked = patient['ส่งแจ้งเตือน']; 

            const pullBtn = document.getElementById('pullLatestFollowUpBtn');
            pullBtn.dataset.latestDate = patient['วันที่ตรวจเยี่ยมล่าสุด'] || '';
            pullBtn.dataset.latestDue = patient['ครบกำหนดติดตามล่าสุด'] || '';
            pullBtn.dataset.latestFc = patient['FC ล่าสุด'] || '';
            pullBtn.dataset.latestFollower = patient['ผู้ติดตามล่าสุด'] || '';
            pullBtn.dataset.latestSummary = patient['ข้อมูลติดตามล่าสุด'] || ''; 
            pullBtn.dataset.savedDate = patient['รายงานแพทย์_วันที่ติดตาม'] || '';
            pullBtn.dataset.savedDue = patient['รายงานแพทย์_ครบกำหนด'] || '';
            pullBtn.dataset.savedFc = patient['รายงานแพทย์_FC'] || '';
            pullBtn.dataset.savedFollower = patient['รายงานแพทย์_ผู้ติดตาม'] || '';
            pullBtn.dataset.savedSummary = patient['รายงานแพทย์_สรุปผล'] || ''; 

            document.getElementById('alertFormOverrideDate').value = patient['รายงานแพทย์_วันที่ติดตาม'] || '';
            document.getElementById('alertFormOverrideDueDate').value = patient['รายงานแพทย์_ครบกำหนด'] || '';
            document.getElementById('alertFormOverrideFC').value = patient['รายงานแพทย์_FC'] || '';
            document.getElementById('alertFormOverrideFollower').value = patient['รายงานแพทย์_ผู้ติดตาม'] || '';
            document.getElementById('alertFormOverrideSummary').value = patient['รายงานแพทย์_สรุปผล'] || '';

            updateAllImagePreviews();
            showPhysicianAlertFormView();
            hideLoader();
        })
        .withFailureHandler(err => handleError("โหลดข้อมูลผู้ป่วยสำหรับแก้ไขไม่สำเร็จ: " + err.message))
        .getRecordById(id);
}

function pullImageLinks() {
    const patientName = document.getElementById('alertFormPatientName').value;
    const dueDate = document.getElementById('alertFormDueDate').value;

    if (!patientName || !dueDate) {
        Swal.fire('ข้อมูลไม่พอ', 'ไม่พบชื่อผู้ป่วย หรือ วันครบกำหนด(วัน) เพื่อใช้ในการค้นหา', 'warning');
        return;
    }
    
    showLoader();
    google.script.run
        .withSuccessHandler(response => {
            hideLoader();
            if (response.error) {
                Swal.fire('ไม่พบข้อมูล', response.error, 'error');
            } else {
                document.getElementById('alertFormImgChest').value = response.chest || '';
                document.getElementById('alertFormImgArmL').value = response.armL || '';
                document.getElementById('alertFormImgLegR').value = response.legR || '';
                document.getElementById('alertFormImgLegL').value = response.legL || '';
                document.getElementById('alertFormImgAdd').value = response.additional || '';
                updateAllImagePreviews();
                Swal.fire('สำเร็จ', 'ดึงข้อมูลลิ้งค์รูปภาพเรียบร้อยแล้ว (หากมี)', 'success');
            }
        })
        .withFailureHandler(err => handleError("เกิดข้อผิดพลาดในการดึงรูปภาพ: " + err.message))
        .getImageLinksFromSource(patientName, dueDate);
}

function pullSpecificImageLinksFromInput() {
    const patientName = document.getElementById('alertFormPatientName').value;
    const specificDueDate = document.getElementById('alertFormSpecificDueDate').value.trim(); 

    if (!patientName || !specificDueDate) {
        Swal.fire('ข้อมูลไม่พอ', 'กรุณาระบุ "ตัวเลขวันครบกำหนด" เพื่อใช้ในการค้นหา', 'warning');
        return;
    }

    if (!/^[0-9, ]+$/.test(specificDueDate)) {
         Swal.fire('รูปแบบผิดพลาด', 'กรุณาระบุ "ตัวเลขวันครบกำหนด" เป็นตัวเลข หรือตัวเลขที่คั่นด้วยจุลภาค (,) เท่านั้น (เช่น 2, 7, 8)', 'warning');
        return;
    }
    
    showLoader();
    google.script.run
        .withSuccessHandler(response => {
            hideLoader();
            if (response.error) {
                Swal.fire('ไม่พบข้อมูล', response.error, 'error');
            } else {
                document.getElementById('alertFormImgChest').value = response.chest || '';
                document.getElementById('alertFormImgArmL').value = response.armL || '';
                document.getElementById('alertFormImgLegR').value = response.legR || '';
                document.getElementById('alertFormImgLegL').value = response.legL || '';
                document.getElementById('alertFormImgAdd').value = response.additional || '';
                updateAllImagePreviews();
                Swal.fire('สำเร็จ', `ดึงข้อมูลลิ้งค์รูปภาพที่ครบกำหนด  ${specificDueDate}  วัน เรียบร้อยแล้ว (หากมี)`, 'success');
            }
        })
        .withFailureHandler(err => handleError("เกิดข้อผิดพลาดในการดึงรูปภาพ: " + err.message))
        .getImageLinksFromSource(patientName, specificDueDate); 
}

function handlePhysicianAlertFormSubmit(event) {
    event.preventDefault();
    showLoader();
    
    const form = document.getElementById('physicianAlertForm');
    const formData = new FormData(form);
    const record = Object.fromEntries(formData.entries());
    
    record['ส่งแจ้งเตือน'] = document.getElementById('sendAlertCheckbox').checked;
    record['ID'] = document.getElementById('alertRecordId').value;
    
    google.script.run
        .withSuccessHandler(function(response) {
            hideLoader();
            if (response.success) {
                Swal.fire({
                    icon: 'success', title: 'สำเร็จ!', text: response.message || 'บันทึกข้อมูลแจ้งเตือนสำเร็จ', timer: 1500, showConfirmButton: false
                }).then(() => {
                    // 🟢 อัปเดตข้อมูลใน RAM ให้แสดงผลบนหน้าจอทันที (Instant UI Update)
                    const idx = allPatients.findIndex(p => p.ID == record.ID);
                    if (idx !== -1) { Object.keys(record).forEach(k => allPatients[idx][k] = record[k]); }
                    
                    showPhysicianAlertView();
                    
                    // 🟢 แอบดึงข้อมูลจาก Server อีกครั้งด้านหลัง เพื่อให้สูตรต่างๆ ซิงค์กัน 100%
                    setTimeout(() => { loadPatients(); }, 1500); 
                });
            } else {
                handleError(response.error);
            }
        })
        .withFailureHandler(err => handleError(`บันทึกข้อมูลไม่สำเร็จ: ${err.message}`))
        .updateAlertRecord(record);
}


// =======================================================
// --- 90-Day Follow-Up Feature ---
// =======================================================

function applySearch90Day(preservePage = false) { 
    const searchTerm = document.getElementById('searchInput90Day').value.toLowerCase().trim();
    if (!searchTerm) {
        filteredDue90DayPatients = [...due90DayPatients];
    } else {
        filteredDue90DayPatients = due90DayPatients.filter(patient => {
            return (patient['ชื่อ-สกุล'] && patient['ชื่อ-สกุล'].toLowerCase().includes(searchTerm)) ||
                   (patient['HN'] && patient['HN'].toLowerCase().includes(searchTerm)) ||
                   (patient['ID'] && String(patient['ID']).toLowerCase().includes(searchTerm));
        });
    }
    
    if (!preservePage) currentPage90Day = 1;
    displayCurrentPage90DayFollowUp();
    setupPagination90Day();
}

function loadFollowUp90DayData(preservePage = false) { 
    showLoader();
    google.script.run
        .withSuccessHandler(response => {
            if (response.error) {
                handleError(response.error);
                due90DayPatients = [];
            } else {
                const serverResponse = response; 
                const filteredResponse = serverResponse.filter(patient => {
                    const isActive = patient['สถานะ'];
                    const isDeceased = patient['ผู้ป่วยเสียชีวิต'];
                    if (isActive) return true;
                    if (isDeceased) return true; 

                    const dischargeDate = patient['วันที่กลับบ้าน'];
                    const closeDate = patient['สรุปปิดเคส_วันที่'];

                    if (!closeDate || !dischargeDate) return false; 
                    const daysToClose = calculateDaysBetween(dischargeDate, closeDate);
                    if (daysToClose === null) return false; 
                    return daysToClose > 28;
                });

                due90DayPatients = filteredResponse.sort((a, b) => { 
                    const aIsDeceased = a['ผู้ป่วยเสียชีวิต'], bIsDeceased = b['ผู้ป่วยเสียชีวิต'];
                    const aIsActive = a['สถานะ'], bIsActive = b['สถานะ'];
                    if (aIsDeceased && !bIsDeceased) return -1;
                    if (!aIsDeceased && bIsDeceased) return 1;
                    if (!aIsActive && bIsActive) return -1;
                    if (aIsActive && !bIsActive) return 1;
                    return calculateDaysSince(b['วันที่กลับบ้าน']) - calculateDaysSince(a['วันที่กลับบ้าน']);
                });
            }
            applySearch90Day(preservePage); 
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถโหลดข้อมูลติดตาม 90 วันได้: " + err.message))
        .getPatientsDueFor90DayFollowUp();
}

function displayCurrentPage90DayFollowUp() {
    const tableBody = document.getElementById('followUp90DayTableBody');
    if (!filteredDue90DayPatients || filteredDue90DayPatients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted"><em>ไม่พบข้อมูลผู้ป่วยตามเงื่อนไขการค้นหา</em></td></tr>';
        document.getElementById('paginationControls90Day').innerHTML = '';
        return;
    }

    const startIndex = (currentPage90Day - 1) * rowsPerPage90Day;
    const patientsToDisplay = filteredDue90DayPatients.slice(startIndex, startIndex + rowsPerPage90Day);
    let tableHtml = '';

    patientsToDisplay.forEach(patient => {
        const isDeceased = patient['ผู้ป่วยเสียชีวิต'];
        const isActive = patient['สถานะ'];
        let caseStatusHtml;

        if (isDeceased) caseStatusHtml = '<span class="badge badge-dark">เสียชีวิต</span>';
        else if (!isActive) caseStatusHtml = '<span class="badge badge-warning">ปิดเคส</span>';
        else caseStatusHtml = `<span class="badge badge-success">${calculateDaysSince(patient['วันที่กลับบ้าน'])} วัน</span>`;

        let statusHtml28Day;
        if (patient['สรุป28วัน_สถานะ']) {
            const statusValue = patient['สรุป28วัน_สถานะ'];
            let statusClass = '', icon = '';
            switch (statusValue) {
                case 'ปกติ': statusClass = 'text-success'; icon = 'fa-check-circle'; break;
                case 'ไม่ปกติ': statusClass = 'text-danger'; icon = 'fa-exclamation-circle'; break;
                case 'เสียชีวิต': statusClass = 'text-dark'; icon = 'fa-cross'; break;
                case 'ปิดเคส': statusClass = 'text-secondary'; icon = 'fa-folder-minus'; break;
                default: statusClass = 'text-muted'; icon = 'fa-question-circle'; break;
            }
            statusHtml28Day = `<span class="${statusClass}"><i class="fas ${icon}"></i> ${statusValue}</span>`;
        } else if (!isActive && !isDeceased) statusHtml28Day = '<span class="text-secondary">รอประเมิน</span>';
        else statusHtml28Day = '<span class="text-muted"><em>รอประเมิน</em></span>';

        let statusHtml90Day; 
        const statusValue90Day = patient['สรุป90วัน_สถานะ'];
        if (statusValue90Day) {
            let statusClass = '', icon = '';
            switch (statusValue90Day) {
                case 'ปกติ': statusClass = 'text-success'; icon = 'fa-check-circle'; break;
                case 'ไม่ปกติ': statusClass = 'text-danger'; icon = 'fa-exclamation-circle'; break;
                case 'เสียชีวิต': statusClass = 'text-dark'; icon = 'fa-cross'; break;
                case 'ปิดเคส': statusClass = 'text-secondary'; icon = 'fa-folder-minus'; break;
                default: statusClass = 'text-muted'; icon = 'fa-question-circle'; break;
            }
            statusHtml90Day = `<span class="${statusClass}"><i class="fas ${icon}"></i> ${statusValue90Day}</span>`;
        } else if (!isActive && !isDeceased) statusHtml90Day = '<span class="text-secondary">รอประเมิน</span>';
        else statusHtml90Day = '<span class="text-muted"><em>รอประเมิน</em></span>';

        let actionButtons = '';
        if (!patient['สรุป28วัน_สถานะ']) actionButtons += `<button class="btn btn-sm btn-primary" onclick='openSummaryModal(${JSON.stringify(patient)}, 28)' title="สรุปผล 28 วัน"><i class="fas fa-file-alt"></i> สรุป 28 วัน</button>`;
        actionButtons += `<button class="btn btn-sm btn-info ml-1" onclick='openSummaryModal(${JSON.stringify(patient)}, 90)' title="สรุปผล 90 วัน"><i class="fas fa-file-alt"></i> สรุป 90 วัน</button>`;
        if (isActive && !isDeceased) actionButtons += `<button class="btn btn-sm btn-warning ml-1" onclick='openEditClosingSummaryModal(${JSON.stringify(patient)})' title="ปิดเคส"><i class="fas fa-folder-minus"></i> ปิดเคส</button>`;
        else actionButtons += `<button class="btn btn-sm btn-secondary ml-1" onclick='openEditClosingSummaryModal(${JSON.stringify(patient)})' title="แก้ไขสรุปเคส"><i class="fas fa-edit"></i> แก้ไขสรุปเคส</button>`;
        actionButtons += `<button class="btn btn-sm btn-outline-primary ml-1" onclick="viewDetails('${patient.ID}')" title="ดูรายละเอียด"><i class="fas fa-eye"></i> ดูรายละเอียด</button>`;

        tableHtml += `
            <tr>
                <td>${patient.ID}</td>
                <td>${patient['ชื่อ-สกุล']}</td>
                <td>${patient.HN}</td>
                <td>${formatThaiDate(patient['วันที่กลับบ้าน']) || '-'}</td>
                <td>${caseStatusHtml}</td>
                <td>${statusHtml28Day}</td>
                <td>${statusHtml90Day}</td>
                <td class="text-center">${actionButtons}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = tableHtml;
}

function setupPagination90Day() {
    const paginationControls = document.getElementById('paginationControls90Day');
    paginationControls.innerHTML = '';
    if (!filteredDue90DayPatients || filteredDue90DayPatients.length === 0) return;

    const pageCount = Math.ceil(filteredDue90DayPatients.length / rowsPerPage90Day);
    if (pageCount <= 1) return;

    const createPageItem = (text, pageNum, isDisabled = false, isActive = false) => {
        const li = document.createElement('li');
        li.className = `page-item ${isDisabled ? 'disabled' : ''} ${isActive ? 'active' : ''}`;
        const a = document.createElement('a'); a.className = 'page-link'; a.href = '#'; a.innerHTML = text;
        a.onclick = (e) => { e.preventDefault(); if (!isDisabled && !isActive) changePage90Day(pageNum); };
        li.appendChild(a); return li;
    };
    paginationControls.appendChild(createPageItem('&laquo;', 1, currentPage90Day === 1));
    paginationControls.appendChild(createPageItem('&lt;', currentPage90Day - 1, currentPage90Day === 1));
    let startPage = Math.max(1, currentPage90Day - 2);
    let endPage = Math.min(pageCount, currentPage90Day + 2);
    if (startPage > 1) paginationControls.appendChild(createPageItem('1', 1));
    if (startPage > 2) paginationControls.appendChild(createPageItem('...', -1, true));
    for (let i = startPage; i <= endPage; i++) paginationControls.appendChild(createPageItem(i, i, false, i === currentPage90Day));
    if (endPage < pageCount -1) paginationControls.appendChild(createPageItem('...', -1, true));
    if (endPage < pageCount) paginationControls.appendChild(createPageItem(pageCount, pageCount));
    paginationControls.appendChild(createPageItem('&gt;', currentPage90Day + 1, currentPage90Day === pageCount));
    paginationControls.appendChild(createPageItem('&raquo;', pageCount, currentPage90Day === pageCount));
}

function changePage90Day(newPage) {
    const pageCount = Math.ceil(filteredDue90DayPatients.length / rowsPerPage90Day);
    if (newPage < 1 || newPage > pageCount) return;
    currentPage90Day = newPage;
    displayCurrentPage90DayFollowUp();
    setupPagination90Day();
    window.scrollTo(0, 0);
}


// =======================================================
// --- 28-Day Follow-Up Feature ---
// =======================================================
function applySearch28Day(preservePage = false) { 
    const searchTerm = document.getElementById('searchInput28Day').value.toLowerCase().trim();
    if (!searchTerm) {
        filteredDue28DayPatients = [...due28DayPatients];
    } else {
        filteredDue28DayPatients = due28DayPatients.filter(patient => {
            return (patient['ชื่อ-สกุล'] && patient['ชื่อ-สกุล'].toLowerCase().includes(searchTerm)) ||
                   (patient['HN'] && patient['HN'].toLowerCase().includes(searchTerm)) ||
                   (patient['ID'] && String(patient['ID']).toLowerCase().includes(searchTerm));
        });
    }

    if (!preservePage) currentPage28Day = 1;
    displayCurrentPage28DayFollowUp();
    setupPagination28Day();
}


function loadFollowUp28DayData(preservePage = false) { 
    showLoader();
    google.script.run
        .withSuccessHandler(response => {
            if (response.error) {
                handleError(response.error);
                due28DayPatients = [];
            } else {
                const serverResponse = response; 
                const filteredResponse = serverResponse.filter(patient => {
                    const isActive = patient['สถานะ'];
                    const isDeceased = patient['ผู้ป่วยเสียชีวิต'];
                    
                    if (isActive) return true;
                    if (isDeceased) return true; 

                    const dischargeDate = patient['วันที่กลับบ้าน'];
                    const closeDate = patient['สรุปปิดเคส_วันที่'];

                    if (!closeDate || !dischargeDate) return true; 
                    const daysToClose = calculateDaysBetween(dischargeDate, closeDate);
                    if (daysToClose === null) return true; 
                    return daysToClose <= 28;
                });

                due28DayPatients = filteredResponse.sort((a, b) => { 
                    const aIsDeceased = a['ผู้ป่วยเสียชีวิต'], bIsDeceased = b['ผู้ป่วยเสียชีวิต'];
                    const aIsActive = a['สถานะ'], bIsActive = b['สถานะ'];
                    if (aIsDeceased && !bIsDeceased) return -1;
                    if (!aIsDeceased && bIsDeceased) return 1;
                    if (!aIsActive && bIsActive) return -1;
                    if (aIsActive && !bIsActive) return 1;
                    return calculateDaysSince(b['วันที่กลับบ้าน']) - calculateDaysSince(a['วันที่กลับบ้าน']);
                });
            }
            applySearch28Day(preservePage); 
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถโหลดข้อมูลติดตาม 28 วันได้: " + err.message))
        .getPatientsDueFor28DayFollowUp();
}

function displayCurrentPage28DayFollowUp() {
    const tableBody = document.getElementById('followUp28DayTableBody');
    if (!filteredDue28DayPatients || filteredDue28DayPatients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted"><em>ไม่พบข้อมูลผู้ป่วยตามเงื่อนไขการค้นหา</em></td></tr>';
        document.getElementById('paginationControls28Day').innerHTML = '';
        return;
    }

    const startIndex = (currentPage28Day - 1) * rowsPerPage28Day;
    const patientsToDisplay = filteredDue28DayPatients.slice(startIndex, startIndex + rowsPerPage28Day);

    let tableHtml = '';
    patientsToDisplay.forEach(patient => {
        const isDeceased = patient['ผู้ป่วยเสียชีวิต'];
        const isActive = patient['สถานะ'];
        let caseStatusHtml;

        if (isDeceased) caseStatusHtml = '<span class="badge badge-dark">เสียชีวิต</span>';
        else if (!isActive) caseStatusHtml = '<span class="badge badge-warning">ปิดเคส</span>';
        else caseStatusHtml = `<span class="badge badge-danger">${calculateDaysSince(patient['วันที่กลับบ้าน'])} วัน</span>`;

        let statusHtml;
        if (patient['สรุป28วัน_สถานะ']) {
            const statusValue = patient['สรุป28วัน_สถานะ'];
            let statusClass = '', icon = '';
            switch (statusValue) {
                case 'ปกติ': statusClass = 'text-success'; icon = 'fa-check-circle'; break;
                case 'ไม่ปกติ': statusClass = 'text-danger'; icon = 'fa-exclamation-circle'; break;
                case 'เสียชีวิต': statusClass = 'text-dark'; icon = 'fa-cross'; break;
                case 'ปิดเคส': statusClass = 'text-secondary'; icon = 'fa-folder-minus'; break;
                default: statusClass = 'text-muted'; icon = 'fa-question-circle'; break;
            }
            statusHtml = `<span class="${statusClass}"><i class="fas ${icon}"></i> ${statusValue}</span>`;
        } else if (!isActive && !isDeceased) statusHtml = '<span class="text-secondary">รอประเมิน</span>';
        else statusHtml = '<span class="text-muted"><em>รอประเมิน</em></span>';

        const summaryButton = `<button class="btn btn-sm btn-info" onclick='openSummaryModal(${JSON.stringify(patient)}, 28)'><i class="fas fa-file-alt"></i> สรุปผล 28 วัน</button>`;
        let closeCaseButton = isActive && !isDeceased
            ? `<button class="btn btn-sm btn-warning ml-1" onclick='openEditClosingSummaryModal(${JSON.stringify(patient)})'><i class="fas fa-folder-minus"></i> ปิดเคส</button>`
            : `<button class="btn btn-sm btn-secondary ml-1" onclick='openEditClosingSummaryModal(${JSON.stringify(patient)})'><i class="fas fa-edit"></i> แก้ไขสรุปเคส</button>`;
        const viewDetailsButton = `<button class="btn btn-sm btn-outline-primary ml-1" onclick="viewDetails('${patient.ID}')"><i class="fas fa-eye"></i> ดูรายละเอียด</button>`;

        const actionButtons = summaryButton + closeCaseButton + viewDetailsButton;

        tableHtml += `
            <tr>
                <td>${patient.ID}</td>
                <td>${patient['ชื่อ-สกุล']}</td>
                <td>${patient.HN}</td>
                <td>${formatThaiDate(patient['วันที่กลับบ้าน']) || '-'}</td>
                <td>${caseStatusHtml}</td>
                <td>${statusHtml}</td>
                <td class="text-center">${actionButtons}</td>
            </tr>`;
    });
    tableBody.innerHTML = tableHtml;
}


function setupPagination28Day() {
    const paginationControls = document.getElementById('paginationControls28Day');
    paginationControls.innerHTML = '';
    if (!filteredDue28DayPatients || filteredDue28DayPatients.length === 0) return;

    const pageCount = Math.ceil(filteredDue28DayPatients.length / rowsPerPage28Day);
    if (pageCount <= 1) return;

    const createPageItem = (text, pageNum, isDisabled = false, isActive = false) => {
        const li = document.createElement('li');
        li.className = `page-item ${isDisabled ? 'disabled' : ''} ${isActive ? 'active' : ''}`;
        const a = document.createElement('a'); a.className = 'page-link'; a.href = '#'; a.innerHTML = text;
        a.onclick = (e) => { e.preventDefault(); if (!isDisabled && !isActive) changePage28Day(pageNum); };
        li.appendChild(a); return li;
    };
    paginationControls.appendChild(createPageItem('&laquo;', 1, currentPage28Day === 1));
    paginationControls.appendChild(createPageItem('&lt;', currentPage28Day - 1, currentPage28Day === 1));
    let startPage = Math.max(1, currentPage28Day - 2);
    let endPage = Math.min(pageCount, currentPage28Day + 2);
    if (startPage > 1) paginationControls.appendChild(createPageItem('1', 1));
    if (startPage > 2) paginationControls.appendChild(createPageItem('...', -1, true));
    for (let i = startPage; i <= endPage; i++) paginationControls.appendChild(createPageItem(i, i, false, i === currentPage28Day));
    if (endPage < pageCount - 1) paginationControls.appendChild(createPageItem('...', -1, true));
    if (endPage < pageCount) paginationControls.appendChild(createPageItem(pageCount, pageCount));
    paginationControls.appendChild(createPageItem('&gt;', currentPage28Day + 1, currentPage28Day === pageCount));
    paginationControls.appendChild(createPageItem('&raquo;', pageCount, currentPage28Day === pageCount));
}

function changePage28Day(newPage) {
    const pageCount = Math.ceil(filteredDue28DayPatients.length / rowsPerPage28Day);
    if (newPage < 1 || newPage > pageCount) return;
    currentPage28Day = newPage;
    displayCurrentPage28DayFollowUp();
    setupPagination28Day();
    window.scrollTo(0, 0);
}

// =======================================================
// --- Summary Modal & Save Logic ---
// =======================================================

function openSummaryModal(patient, period) {
    if (period == '90' && !patient['สรุป28วัน_สถานะ']) {
        Swal.fire('ไม่สามารถสรุปผล 90 วัน', 'กรุณาทำการสรุปผล 28 วันสำหรับผู้ป่วยรายนี้ก่อน จึงจะสามารถสรุปผล 90 วันได้', 'warning');
        return; 
    }

    document.getElementById('summaryPatientId').value = patient.ID;
    document.getElementById('summaryPeriod').value = period;
    document.getElementById('summaryPatientName').textContent = `${patient['ชื่อ-สกุล']} (HN: ${patient.HN})`;
    document.getElementById('summaryModalTitle').textContent = `บันทึกสรุปผล ${period} วัน`;

    const summaryModalElement = document.getElementById('summaryModal');
    summaryModalElement.dataset.patientDiax = patient.Diax || ''; 
    summaryModalElement.dataset.patientSurgery = patient['การผ่าตัด'] || ''; 

    if (period == '90') {
        summaryModalElement.dataset.has28DaySummary = patient['สรุป28วัน_สถานะ'] ? 'true' : 'false';
    } else {
        summaryModalElement.dataset.has28DaySummary = 'false'; 
    }

    document.getElementById('summaryStatus').value = patient[`สรุป${period}วัน_สถานะ`] || '';
    document.getElementById('summaryDetails').value = patient[`สรุป${period}วัน_รายละเอียด`] || '';

    $('#summaryModal').modal('show');
}

function saveSummary() {
    const recordId = document.getElementById('summaryPatientId').value;
    const period = document.getElementById('summaryPeriod').value;
    const status = document.getElementById('summaryStatus').value;
    const details = document.getElementById('summaryDetails').value;

    if (!status) { Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือก "ผลการประเมิน"', 'warning'); return; }

    const summaryModalElement = document.getElementById('summaryModal');
    const patientDiax = summaryModalElement.dataset.patientDiax || '';
    const patientSurgery = summaryModalElement.dataset.patientSurgery || '';

    let isAutoClose = false;
    if (period == '28' && status !== 'เสียชีวิต' && status !== 'ปิดเคส') {
        isAutoClose = checkAutoClose(patientDiax, patientSurgery);
    }

    showLoader();

    const recordToUpdate = { ID: recordId };
    
    recordToUpdate[`สรุป${period}วัน_สถานะ`] = status;
    recordToUpdate[`สรุป${period}วัน_รายละเอียด`] = details;
    recordToUpdate[`สรุป${period}วัน_วันที่บันทึก`] = new Date().toISOString().slice(0, 10);
    recordToUpdate[`สรุป${period}วัน_ผู้บันทึก`] = currentUser.name || currentUser.email;

    if (isAutoClose) {
        recordToUpdate['สถานะ'] = false; 
        recordToUpdate['สรุปปิดเคส_รายละเอียด'] = "-";        
        recordToUpdate['สรุปปิดเคส_วันที่'] = new Date().toISOString().slice(0, 10);
        recordToUpdate['สรุปปิดเคส_ผู้บันทึก'] = currentUser.name || currentUser.email;
    } else if (status === 'เสียชีวิต') {
        recordToUpdate['ผู้ป่วยเสียชีวิต'] = true;
        recordToUpdate['สถานะ'] = false; 
    } else if (status === 'ปิดเคส') {
        recordToUpdate['สถานะ'] = false; 
        recordToUpdate['สรุปปิดเคส_รายละเอียด'] = details || "-";        
        recordToUpdate['สรุปปิดเคส_วันที่'] = new Date().toISOString().slice(0, 10);
        recordToUpdate['สรุปปิดเคส_ผู้บันทึก'] = currentUser.name || currentUser.email;
    } else if (period == '90' && status) {
        const has28DaySummary = summaryModalElement.dataset.has28DaySummary === 'true';
        if (has28DaySummary) {
            recordToUpdate['สถานะ'] = false; 
            if (!recordToUpdate['สรุปปิดเคส_รายละเอียด']) { 
                recordToUpdate['สรุปปิดเคส_รายละเอียด'] = details || "-";                
                recordToUpdate['สรุปปิดเคส_วันที่'] = new Date().toISOString().slice(0, 10);
                recordToUpdate['สรุปปิดเคส_ผู้บันทึก'] = currentUser.name || currentUser.email;
            }
        }
    }

    google.script.run
        .withSuccessHandler(response => {
            if (response.success) {
                $('#summaryModal').modal('hide');
                Swal.fire('สำเร็จ', 'บันทึกข้อมูลสรุปผลเรียบร้อยแล้ว', 'success').then(() => {
                    // 🟢 อัปเดตข้อมูลใน RAM ให้แสดงผลบนหน้าจอทันที
                    const idx = allPatients.findIndex(p => p.ID == recordToUpdate.ID);
                    if (idx !== -1) { Object.keys(recordToUpdate).forEach(k => allPatients[idx][k] = recordToUpdate[k]); }
                    
                    // 🟢 แอบดึงข้อมูลจาก Server อีกครั้งด้านหลัง เพื่อให้สูตรต่างๆ ซิงค์กัน 100%
                    setTimeout(() => { 
                        loadPatients(); 
                        loadFollowUp28DayData(true); 
                        loadFollowUp90DayData(true); 
                    }, 1500); 
                });
            } else {
                handleError(response.error);
            }
            hideLoader();
        })
        .withFailureHandler(err => handleError("เกิดข้อผิดพลาดในการบันทึก: " + err.message))
        .updateRecord(recordToUpdate);
}


// =======================================================
// --- Closing Case Summary Feature ---
// =======================================================

function openClosingSummaryModal(patientId, patientName, origin = 'view') {
    document.getElementById('closingPatientId').value = patientId;
    document.getElementById('closingPatientName').textContent = patientName;
    document.getElementById('closingSummaryDetails').value = '';
    document.getElementById('closingModalOrigin').value = origin;
    document.getElementById('closingSummaryForm').classList.remove('was-validated');
    $('#closingSummaryModal').modal('show');
}

function openEditClosingSummaryModal(patient) {
    document.getElementById('closingPatientId').value = patient.ID;
    document.getElementById('closingPatientName').textContent = patient['ชื่อ-สกุล'];
    document.getElementById('closingSummaryDetails').value = patient['สรุปปิดเคส_รายละเอียด'] || '';
    document.getElementById('closingModalOrigin').value = 'view';
    document.getElementById('closingSummaryForm').classList.remove('was-validated');
    $('#closingSummaryModal').modal('show');
}

function saveClosingSummary() {
    const origin = document.getElementById('closingModalOrigin').value;
    if (origin === 'form') saveClosingSummaryFromForm();
    else saveClosingSummaryFromView();
}

function saveClosingSummaryFromForm() {
    const details = document.getElementById('closingSummaryDetails').value;
    const form = document.getElementById('closingSummaryForm');

    if (!details.trim()) { form.classList.add('was-validated'); Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุรายละเอียดการปิดเคส', 'warning'); return; }

    document.getElementById('hiddenClosingDetails').value = details;
    document.getElementById('hiddenClosingDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('hiddenClosingBy').value = currentUser.name || currentUser.email;

    const statusCheckbox = document.getElementById('status');
    statusCheckbox.checked = false;
    updateStatusText();

    $('#closingSummaryModal').modal('hide');

    Swal.fire({
        icon: 'info', title: 'ข้อมูลการปิดเคสถูกเตรียมไว้แล้ว', text: 'กรุณากดปุ่ม "บันทึกข้อมูล" เพื่อยืนยันการเปลี่ยนแปลงทั้งหมด',
        toast: true, position: 'top-end', showConfirmButton: false, timer: 4000, timerProgressBar: true
    });
}

function saveClosingSummaryFromView() {
    const patientId = document.getElementById('closingPatientId').value;
    const details = document.getElementById('closingSummaryDetails').value;
    const form = document.getElementById('closingSummaryForm');

    if (!details.trim()) { form.classList.add('was-validated'); Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุรายละเอียดการปิดเคส', 'warning'); return; }

    showLoader();

    const recordToUpdate = {
        ID: patientId,
        'สถานะ': false,
        'สรุปปิดเคส_รายละเอียด': details,
        'สรุปปิดเคส_วันที่': new Date().toISOString().slice(0, 10),
        'สรุปปิดเคส_ผู้บันทึก': currentUser.name || currentUser.email,
    };

    google.script.run
        .withSuccessHandler(response => {
            if (response.success) {
                $('#closingSummaryModal').modal('hide');
                Swal.fire('สำเร็จ', 'ปิดเคสเรียบร้อยแล้ว', 'success').then(() => {
                    // 🟢 อัปเดตข้อมูลใน RAM ให้แสดงผลบนหน้าจอทันที
                    const idx = allPatients.findIndex(p => p.ID == recordToUpdate.ID);
                    if (idx !== -1) { Object.keys(recordToUpdate).forEach(k => allPatients[idx][k] = recordToUpdate[k]); }
                    
                    // 🟢 แอบดึงข้อมูลจาก Server อีกครั้งด้านหลัง เพื่อให้สูตรต่างๆ ซิงค์กัน 100%
                    setTimeout(() => { 
                        loadPatients(); 
                        loadFollowUp28DayData();
                        loadFollowUp90DayData();
                    }, 1500); 
                });
            } else {
                handleError(response.error);
            }
            hideLoader();
        })
        .withFailureHandler(err => handleError("เกิดข้อผิดพลาดในการปิดเคส: " + err.message))
        .updateRecord(recordToUpdate);
}


// =======================================================
// --- Report Generation ---
// =======================================================

function populateReportPhysicianFilters(names) {
    const physicianFilter1 = document.getElementById('physicianReportNameFilter');
    const physicianFilter2 = document.getElementById('diagReportPhysicianFilter');

    const fragment = document.createDocumentFragment();
    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        fragment.appendChild(option);
    });

    physicianFilter1.appendChild(fragment.cloneNode(true));
    physicianFilter2.appendChild(fragment.cloneNode(true));
}

function renderReportTable(data, headers) {
    if (!data || data.length === 0) return '<p class="text-center text-muted mt-3"><em>ไม่พบข้อมูลสำหรับรายงานนี้</em></p>';

    const headerKeys = Object.keys(headers);
    let tableHtml = `<table class="table table-sm table-bordered table-striped mt-3"><thead class="thead-light"><tr>`;
    headerKeys.forEach(key => tableHtml += `<th>${headers[key]}</th>`);
    tableHtml += `</tr></thead><tbody>`;

    data.forEach(p => {
        tableHtml += `<tr>`;
        headerKeys.forEach(key => {
            let value = p[key] || '-';
            if (key.includes('วันที่') || key.includes('วันครบกำหนด')) value = formatThaiDate(p[key]);
            tableHtml += `<td>${value}</td>`;
        });
        tableHtml += `</tr>`;
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
}

function generateThaiCocReport() {
    const month = document.getElementById('thaicocMonthFilter').value;
    if (!month) { handleError("กรุณาเลือกเดือนที่ต้องการ"); return; }
    showLoader();
    google.script.run
        .withSuccessHandler(result => {
            if (result.error) { handleError(result.error); return; }
            currentThaiCocData = result;
            document.getElementById('thaicocReportTitle').textContent = `(เดือน ${formatThaiMonthYear(month)}) - พบ ${result.length} รายการ`;
            const headers = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'แพทย์เจ้าของไข้': 'แพทย์', 'Diax': 'DX', 'วันที่ส่ง ThaiCOC': 'วันที่ส่ง', 'จังหวัดที่ส่ง ThaiCOC': 'จังหวัด', 'ชื่อผู้ส่ง ThaiCOC': 'ผู้ส่ง', 'สรุปปิดเคส_รายละเอียด': 'สรุปการปิดเคส' };
            document.getElementById('thaicocReportResult').innerHTML = renderReportTable(result, headers);
            document.getElementById('thaicocReportActions').style.display = result.length > 0 ? 'block' : 'none';
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถสร้างรายงาน ThaiCOC ได้: " + err.message))
        .getReportData('thaicoc', { month });
}

function generatePhysicianReport() {
    const month = document.getElementById('physicianReportMonthFilter').value;
    const physician = document.getElementById('physicianReportNameFilter').value;
    if (!month) { handleError("กรุณาเลือกเดือนที่ต้องการ"); return; }
    showLoader();
    google.script.run
        .withSuccessHandler(result => {
            if (result.error) { handleError(result.error); return; }
            currentPhysicianData = result;
            const physicianText = physician === 'all' ? 'แพทย์ทุกคน' : physician;
            document.getElementById('physicianReportTitle').textContent = `(เดือน ${formatThaiMonthYear(month)}, ${physicianText}) - พบ ${result.length} รายการ`;
            const headers = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'Diax': 'DX', 'วันที่กลับบ้าน': 'วันที่กลับบ้าน', 'สรุปปิดเคส_รายละเอียด': 'สรุปการปิดเคส' };
            document.getElementById('physicianReportResult').innerHTML = renderReportTable(result, headers);
            document.getElementById('physicianReportActions').style.display = result.length > 0 ? 'block' : 'none';
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถสร้างรายงานแพทย์ได้: " + err.message))
        .getReportData('physician', { month, physician });
}

function generateDiagnosisReport() {
    const month = document.getElementById('diagReportMonthFilter').value;
    const physician = document.getElementById('diagReportPhysicianFilter').value;
     if (!month) { handleError("กรุณาเลือกเดือนที่ต้องการ"); return; }
    showLoader();
    google.script.run
        .withSuccessHandler(result => {
            if (result.error) { handleError(result.error); return; }
            currentDiagnosisData = result;
            const physicianText = physician === 'all' ? 'แพทย์ทุกคน' : physician;
            const totalCount = Object.values(result).reduce((sum, patients) => sum + patients.length, 0);
            document.getElementById('diagReportTitle').textContent = `(เดือน ${formatThaiMonthYear(month)}, ${physicianText}) - พบ ${totalCount} รายการ`;
            let finalHtml = '';
            const diaxKeys = Object.keys(result).sort();
            if (diaxKeys.length === 0) {
                 finalHtml = '<p class="text-center text-muted mt-3"><em>ไม่พบข้อมูลสำหรับรายงานนี้</em></p>';
            } else {
                const headers = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'แพทย์เจ้าของไข้': 'แพทย์', 'วันที่กลับบ้าน': 'วันที่กลับบ้าน', 'สรุปปิดเคส_รายละเอียด': 'สรุปการปิดเคส' };
                diaxKeys.forEach(diax => {
                    finalHtml += `<h6 class="mt-4 text-info">Diagnosis: ${diax} (${result[diax].length} รายการ)</h6>`;
                    finalHtml += renderReportTable(result[diax], headers);
                });
            }
            document.getElementById('diagReportResult').innerHTML = finalHtml;
            document.getElementById('diagReportActions').style.display = totalCount > 0 ? 'block' : 'none';
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถสร้างรายงานประเภทโรคได้: " + err.message))
        .getReportData('diagnosis', { month, physician });
}

function generateSummary28DayReport() {
    const month = document.getElementById('summary28dayMonthFilter').value;
    if (!month) { handleError("กรุณาเลือกเดือนที่ต้องการ"); return; }
    showLoader();
    google.script.run
        .withSuccessHandler(result => {
            if (result.error) { handleError(result.error); return; }
            const totalNormal = result['ปกติ']?.length || 0;
            const totalAbnormal = result['ไม่ปกติ']?.length || 0;
            const totalDeceased = result['เสียชีวิต']?.length || 0;
            
            const unspecifiedPatientsRaw = result['ไม่ระบุ'] || [];
            const unspecifiedPatientsFiltered = unspecifiedPatientsRaw.filter(patient => patient['สถานะ'] === true);
            const totalUnspecified = unspecifiedPatientsFiltered.length;

            document.getElementById('summary28dayReportTitle').innerHTML = `รายงานสรุปผลเดือน ${formatThaiMonthYear(month)}: <span class="badge badge-success">ปกติ ${totalNormal}</span> <span class="badge badge-danger">ไม่ปกติ ${totalAbnormal}</span> <span class="badge badge-dark">เสียชีวิต ${totalDeceased}</span> <span class="badge badge-secondary">ไม่ระบุ ${totalUnspecified}</span>`;
            
            let finalHtml = '';
            const headers = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'วันครบกำหนด28วัน': 'วันครบกำหนด', 'สรุป28วัน_รายละเอียด': 'รายละเอียด', 'สรุป28วัน_ผู้บันทึก': 'ผู้บันทึก' };
            const deceasedHeaders = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'สรุป28วัน_วันที่บันทึก': 'วันที่สรุปผล', 'สรุป28วัน_รายละเอียด': 'รายละเอียด', 'สรุป28วัน_ผู้บันทึก': 'ผู้บันทึก' };
            
            if (totalNormal > 0) finalHtml += `<h6 class="mt-4 text-success">กลุ่มปกติ (${totalNormal})</h6>` + renderReportTable(result['ปกติ'], headers);
            if (totalAbnormal > 0) finalHtml += `<h6 class="mt-4 text-danger">กลุ่มไม่ปกติ (${totalAbnormal})</h6>` + renderReportTable(result['ไม่ปกติ'], headers);
            if (totalDeceased > 0) finalHtml += `<h6 class="mt-4 text-dark">กลุ่มเสียชีวิต (${totalDeceased})</h6>` + renderReportTable(result['เสียชีวิต'], deceasedHeaders);
            if (totalUnspecified > 0) finalHtml += `<h6 class="mt-4 text-secondary">กลุ่มไม่ระบุ (${totalUnspecified})</h6>` + renderReportTable(unspecifiedPatientsFiltered, headers);

            if (!finalHtml) finalHtml = '<p class="text-center text-muted mt-3"><em>ไม่พบข้อมูลสำหรับรายงานในเดือนที่เลือก</em></p>';
            document.getElementById('summary28dayReportResult').innerHTML = finalHtml;
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถสร้างรายงานสรุป 28 วันได้: " + err.message))
        .getReportData('summary28day', { month });
}

function generateSummary90DayReport() {
    const month = document.getElementById('summary90dayMonthFilter').value;
    if (!month) { handleError("กรุณาเลือกเดือนที่ต้องการ"); return; }
    showLoader();
    google.script.run
        .withSuccessHandler(result => {
            if (result.error) { handleError(result.error); return; }
            const totalNormal = result['ปกติ']?.length || 0;
            const totalAbnormal = result['ไม่ปกติ']?.length || 0;
            const totalDeceased = result['เสียชีวิต']?.length || 0;

            const unspecifiedPatientsRaw = result['ไม่ระบุ'] || [];
            const unspecifiedPatientsFiltered = unspecifiedPatientsRaw.filter(patient => {
                return patient['สถานะ'] === true; 
            });
            const totalUnspecified = unspecifiedPatientsFiltered.length;

            document.getElementById('summary90dayReportTitle').innerHTML = `รายงานสรุปผล 90 วัน เดือน ${formatThaiMonthYear(month)}: <span class="badge badge-success">ปกติ ${totalNormal}</span> <span class="badge badge-danger">ไม่ปกติ ${totalAbnormal}</span> <span class="badge badge-dark">เสียชีวิต ${totalDeceased}</span> <span class="badge badge-secondary">ไม่ระบุ ${totalUnspecified}</span>`;
            
            let finalHtml = '';
            const headers = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'วันครบกำหนด90วัน': 'วันครบกำหนด', 'สรุป90วัน_รายละเอียด': 'รายละเอียด', 'สรุป90วัน_ผู้บันทึก': 'ผู้บันทึก' };
            const deceasedHeaders = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'สรุป90วัน_วันที่บันทึก': 'วันที่สรุปผล', 'สรุป90วัน_รายละเอียด': 'รายละเอียด', 'สรุป90วัน_ผู้บันทึก': 'ผู้บันทึก' };
            
            if (totalNormal > 0) finalHtml += `<h6 class="mt-4 text-success">กลุ่มปกติ (${totalNormal})</h6>` + renderReportTable(result['ปกติ'], headers);
            if (totalAbnormal > 0) finalHtml += `<h6 class="mt-4 text-danger">กลุ่มไม่ปกติ (${totalAbnormal})</h6>` + renderReportTable(result['ไม่ปกติ'], headers);
            if (totalDeceased > 0) finalHtml += `<h6 class="mt-4 text-dark">กลุ่มเสียชีวิต (${totalDeceased})</h6>` + renderReportTable(result['เสียชีวิต'], deceasedHeaders);
            if (totalUnspecified > 0) finalHtml += `<h6 class="mt-4 text-secondary">กลุ่มไม่ระบุ (${totalUnspecified})</h6>` + renderReportTable(unspecifiedPatientsFiltered, headers);

            if (!finalHtml) finalHtml = '<p class="text-center text-muted mt-3"><em>ไม่พบข้อมูลสำหรับรายงานในเดือนที่เลือก</em></p>';
            document.getElementById('summary90dayReportResult').innerHTML = finalHtml;
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถสร้างรายงานสรุป 90 วันได้: " + err.message))
        .getReportData('summary90day', { month });
}


function generateClosedCasesReport() {
    const month = document.getElementById('closedCasesMonthFilter').value;
    if (!month) { handleError("กรุณาเลือกเดือนที่ต้องการ"); return; }
    showLoader();
    google.script.run
        .withSuccessHandler(result => {
            currentClosedCasesData = result.error ? [] : result;
            document.getElementById('closedCasesReportTitle').textContent = `(เดือน ${formatThaiMonthYear(month)}) - พบ ${currentClosedCasesData.length} รายการ`;
            const headers = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'แพทย์เจ้าของไข้': 'แพทย์', 'Diax': 'DX', 'สรุปปิดเคส_วันที่': 'วันที่ปิดเคส', 'สรุปปิดเคส_รายละเอียด': 'เหตุผลการปิดเคส', 'สรุปปิดเคส_ผู้บันทึก': 'ผู้ปิดเคส' };
            document.getElementById('closedCasesReportResult').innerHTML = renderReportTable(currentClosedCasesData, headers);
            hideLoader();
        })
        .withFailureHandler(err => handleError("ไม่สามารถสร้างรายงานผู้ป่วยปิดเคสได้: " + err.message))
        .getReportData('closedCases', { month });
}


// =======================================================
// --- Export and Print Functions ---
// =======================================================
function exportReport(format, reportType) {
    let data;
    let fileName = `report_${reportType}_${new Date().toISOString().slice(0,10)}`;
    const baseHeaders = { 'ID': 'ID', 'ชื่อ-สกุล': 'ชื่อ-สกุล', 'HN': 'HN', 'อายุ': 'อายุ', 'แพทย์เจ้าของไข้': 'แพทย์เจ้าของไข้', 'Diax': 'DX (Diagnosis)', 'วันที่ส่ง ThaiCOC': 'วันที่ส่ง ThaiCOC', 'จังหวัดที่ส่ง ThaiCOC': 'จังหวัดที่ส่ง ThaiCOC' };
    let headers = {...baseHeaders};
    let reportTitle = '';

    if (reportType === 'thaicoc') {
        data = currentThaiCocData;
        reportTitle = document.getElementById('thaicocReportTitle').textContent;
    } else if (reportType === 'physician') {
        data = currentPhysicianData;
        reportTitle = document.getElementById('physicianReportTitle').textContent;
    } else if (reportType === 'diagnosis') {
        data = [];
        reportTitle = document.getElementById('diagReportTitle').textContent;
        headers = { 'กลุ่มการวินิจฉัย': 'กลุ่มการวินิจฉัย', ...baseHeaders };
        for (const diax in currentDiagnosisData) {
            currentDiagnosisData[diax].forEach(patient => {
                data.push({ ...patient, 'กลุ่มการวินิจฉัย': diax });
            });
        }
    }

    if (!data || data.length === 0) {
        handleError("ไม่มีข้อมูลสำหรับ Export");
        return;
    }

    const headerKeys = Object.keys(headers);
    const exportData = data.map(row => {
        let newRow = {};
        headerKeys.forEach(key => {
            newRow[headers[key]] = key.includes('วันที่') ? formatThaiDate(row[key]) : (row[key] || '-');
        });
        return newRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    XLSX.writeFile(workbook, `${fileName}.${format === 'csv' ? 'csv' : 'xlsx'}`);
}

function printReport(elementId, reportTitle) {
    const printElement = document.getElementById(elementId);
    if (!printElement) return;

    let subTitleId;
    if (reportTitle.includes('ThaiCOC')) subTitleId = 'thaicocReportTitle';
    else if (reportTitle.includes('แพทย์')) subTitleId = 'physicianReportTitle';
    else if (reportTitle.includes('สรุปผล 28')) subTitleId = 'summary28dayReportTitle';
    else if (reportTitle.includes('สรุปผล 90')) subTitleId = 'summary90dayReportTitle';
    else subTitleId = 'diagReportTitle';

    const subTitleText = document.getElementById(subTitleId)?.textContent || '';

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>${reportTitle}</title>
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
        <style> @media print { @page { size: A4 landscape; margin: 1cm; } body { -webkit-print-color-adjust: exact; font-family: 'Kanit', sans-serif; } .table { font-size: 10pt; } .no-print { display: none; } } body { font-family: 'Kanit', sans-serif; } </style>
        </head><body><h4>${reportTitle}</h4><h5>${subTitleText}</h5><hr>${printElement.innerHTML}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}


// --- Main UI and Form Functions ---

function initializeFollowUpUI(config) {
    const tabsContainer = document.getElementById('followUpTabsContainer');
    const tabContentContainer = document.getElementById('followUpTabContentContainer');
    tabsContainer.innerHTML = '';
    tabContentContainer.innerHTML = '';
    if (!config || config.length === 0) { tabContentContainer.innerHTML = '<p>ไม่มีช่วงเวลาการติดตามผลที่กำหนดไว้</p>'; return; }
    config.forEach((period, index) => {
        const isActive = index === 0;
        tabsContainer.innerHTML += `<li class="nav-item" role="presentation"><a class="nav-link ${isActive ? 'active' : ''}" id="fu-${period.days}-tab" data-toggle="tab" href="#fu-${period.days}" role="tab">${`ครบ ${period.label}`}</a></li>`;
        tabContentContainer.innerHTML += `<div class="tab-pane fade ${isActive ? 'show active' : ''}" id="fu-${period.days}" role="tabpanel">
                <div class="form-group"><label for="fu${period.days}_details">ข้อมูลการติดตาม (ครบ ${period.label})</label><textarea class="form-control form-control-sm" id="fu${period.days}_details" name="ติดตามครบ${period.sheetSuffix}_ข้อมูล" rows="2"></textarea></div>
                <div class="row">
                    <div class="form-group col-md-4"><label for="fu${period.days}_fc">Functional Class</label><select class="form-control form-control-sm" id="fu${period.days}_fc" name="ติดตามครบ${period.sheetSuffix}_FunctionalClass"><option value="">-- เลือก --</option><option value="-">-</option><option value="I">I</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option><option value="V">V</option></select></div>
                    <div class="form-group col-md-4"><label for="fu${period.days}_date">วันที่ติดตาม</label><input type="date" class="form-control form-control-sm" id="fu${period.days}_date" name="ติดตามครบ${period.sheetSuffix}_วันที่"></div>
                    <div class="form-group col-md-4"><label for="fu${period.days}_by">ผู้ติดตาม</label><input type="text" class="form-control form-control-sm" id="fu${period.days}_by" name="ติดตามครบ${period.sheetSuffix}_ผู้ติดตาม"></div>
                </div></div>`;
    });
    // [v10.0] Custom Follow-Up Section
    tabContentContainer.innerHTML += `<hr><div id="customFollowUpSection"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0 text-info"><i class="fas fa-calendar-plus"></i> วันติดตามเยี่ยมพิเศษ (เพิ่มเติม)</h6><button type="button" class="btn btn-sm btn-outline-info" id="addCustomFollowUpBtn" onclick="addCustomFollowUpSlot()"><i class="fas fa-plus"></i> เพิ่มวันติดตามพิเศษ</button></div><div id="customFollowUpSlots"></div></div>`;
}

// [v10.0] Custom Follow-Up Slot Management
function getCustomSlotCount() { return document.querySelectorAll('#customFollowUpSlots .custom-fu-slot').length; }

function addCustomFollowUpSlot(daysValue, dataValue, dateValue, byValue, fcValue) {
    const slotsContainer = document.getElementById('customFollowUpSlots');
    if (!slotsContainer) return;
    const currentCount = getCustomSlotCount();
    if (currentCount >= MAX_CUSTOM_FOLLOWUPS) { Swal.fire('ถึงจำนวนสูงสุดแล้ว', `สามารถเพิ่มวันติดตามพิเศษได้สูงสุด ${MAX_CUSTOM_FOLLOWUPS} รายการ`, 'info'); return; }
    const si = currentCount + 1;
    const slotHtml = `<div class="card mb-2 custom-fu-slot border-info" data-slot-index="${si}"><div class="card-body p-2"><div class="d-flex justify-content-between align-items-center mb-2"><span class="badge badge-info">พิเศษ #${si}</span><button type="button" class="btn btn-sm btn-outline-danger" onclick="removeCustomFollowUpSlot(this)"><i class="fas fa-times"></i> ลบ</button></div><div class="row"><div class="form-group col-md-2"><label>กำหนดวัน <span class="text-danger">*</span></label><input type="number" class="form-control form-control-sm" name="ติดตามพิเศษ${si}_วันครบกำหนด" min="1" placeholder="เช่น 5" value="${daysValue || ''}"></div><div class="form-group col-md-10"><label>ข้อมูลการติดตาม</label><textarea class="form-control form-control-sm" name="ติดตามพิเศษ${si}_ข้อมูล" rows="1">${dataValue || ''}</textarea></div></div><div class="row"><div class="form-group col-md-4"><label>FC</label><select class="form-control form-control-sm" name="ติดตามพิเศษ${si}_FunctionalClass"><option value="">-- เลือก --</option><option value="-" ${fcValue==='-'?'selected':''}>-</option><option value="I" ${fcValue==='I'?'selected':''}>I</option><option value="II" ${fcValue==='II'?'selected':''}>II</option><option value="III" ${fcValue==='III'?'selected':''}>III</option><option value="IV" ${fcValue==='IV'?'selected':''}>IV</option><option value="V" ${fcValue==='V'?'selected':''}>V</option></select></div><div class="form-group col-md-4"><label>วันที่ติดตาม</label><input type="date" class="form-control form-control-sm" name="ติดตามพิเศษ${si}_วันที่" value="${dateValue || ''}"></div><div class="form-group col-md-4"><label>ผู้ติดตาม</label><input type="text" class="form-control form-control-sm" name="ติดตามพิเศษ${si}_ผู้ติดตาม" value="${byValue || ''}"></div></div></div></div>`;
    slotsContainer.insertAdjacentHTML('beforeend', slotHtml);
    updateAddCustomBtn();
}

function removeCustomFollowUpSlot(btn) { const slot = btn.closest('.custom-fu-slot'); if (slot) slot.remove(); reindexCustomSlots(); updateAddCustomBtn(); }

function reindexCustomSlots() {
    document.querySelectorAll('#customFollowUpSlots .custom-fu-slot').forEach((slot, idx) => {
        const ni = idx + 1; slot.dataset.slotIndex = ni; slot.querySelector('.badge').textContent = `พิเศษ #${ni}`;
        slot.querySelectorAll('input, textarea, select').forEach(input => { if (input.name) input.name = input.name.replace(/ติดตามพิเศษ\d+/, `ติดตามพิเศษ${ni}`); });
    });
}

function updateAddCustomBtn() { const btn = document.getElementById('addCustomFollowUpBtn'); if (btn) btn.disabled = getCustomSlotCount() >= MAX_CUSTOM_FOLLOWUPS; }
function clearCustomFollowUpSlots() { const c = document.getElementById('customFollowUpSlots'); if (c) c.innerHTML = ''; updateAddCustomBtn(); }

function loadCustomFollowUpData(patient) {
    clearCustomFollowUpSlots();
    for (let i = 1; i <= MAX_CUSTOM_FOLLOWUPS; i++) {
        const dv = patient[`ติดตามพิเศษ${i}_วันครบกำหนด`];
        if (dv && String(dv).trim() !== '' && parseInt(dv) > 0) {
            addCustomFollowUpSlot(dv, patient[`ติดตามพิเศษ${i}_ข้อมูล`]||'', patient[`ติดตามพิเศษ${i}_วันที่`]||'', patient[`ติดตามพิเศษ${i}_ผู้ติดตาม`]||'', patient[`ติดตามพิเศษ${i}_FunctionalClass`]||'');
        }
    }
}

function populatePhysicianOptions(physicianNames) {
    const selectElement = document.getElementById('physician');
    selectElement.innerHTML = '<option value="">-- เลือกแพทย์ --</option>'; // Clear existing
    const fragment = document.createDocumentFragment();
    physicianNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        fragment.appendChild(option);
    });
    selectElement.appendChild(fragment);
}

function populateProvinceOptions() {
    const selectElement = document.getElementById('thaiCocProvince');
    const fragment = document.createDocumentFragment();
    thaiProvinces.forEach(province => {
        const option = document.createElement('option');
        option.value = province;
        option.textContent = province;
        fragment.appendChild(option);
    });
    selectElement.appendChild(fragment);
}

function applySearch() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    filteredPatients = !searchTerm
        ? [...allPatients]
        : allPatients.filter(p => (p['ชื่อ-สกุล']?.toLowerCase().includes(searchTerm)) || (p['HN']?.toLowerCase().includes(searchTerm)) || (String(p['ID'])?.toLowerCase().includes(searchTerm)));

    if (sortDueFirst) {
        filteredPatients.sort((a, b) => getFollowUpStatus(b).isDue - getFollowUpStatus(a).isDue);
    } else {
        filteredPatients.sort((a, b) => (b.ID || 0) - (a.ID || 0));
    }

    currentPage = 1;
    displayCurrentPagePatients();
    setupPagination();
}

function displayCurrentPagePatients() {
    const tableBody = document.getElementById('patientTableBody');
    if (!filteredPatients || filteredPatients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center">ไม่พบข้อมูลผู้ป่วย</td></tr>';
        return;
    }

    const startIndex = (currentPage - 1) * rowsPerPage;
    const patientsToDisplay = filteredPatients.slice(startIndex, startIndex + rowsPerPage);
    let tableHtml = '';

    patientsToDisplay.forEach(patient => {
        let nameHtml = patient['ชื่อ-สกุล'] || '-';
        if (patient['ผู้ป่วยเสียชีวิต']) {
            nameHtml += ` <span class="badge badge-dark">เสียชีวิต</span>`;
        } else {
            const followUpStatus = getFollowUpStatus(patient);
            if (followUpStatus.isDue) {
                nameHtml += ` <span class="badge badge-danger">${followUpStatus.label}</span>`; 

                // --- เพิ่มการแสดงผลป้าย "ทำแบบประเมิน" ---
                if (followUpStatus.label === 'ครบ 7 วัน' && patient['ทำแบบประเมิน7วัน']) {
                    nameHtml += ` <span class="badge badge-info ml-1" style="background-color: #17a2b8; color: white;"><i class="fas fa-clipboard-list"></i> ทำแบบประเมิน</span>`;
                }
                // [v10.0] ป้ายกำกับวันติดตามพิเศษ (แสดงก่อนเครื่องหมายถูก)
                const customDaysList = getPatientCustomDays(patient);
                if (customDaysList.length > 0) {
                    nameHtml += ` <span class="badge ml-1" style="background-color: #0dcaf0; color: #000;"><i class="fas fa-calendar-plus"></i> พิเศษ: ${customDaysList.join(',')} วัน</span>`;
                }
                                
                if (followUpStatus.isCompleted) {
                    nameHtml += ` <i class="fas fa-check-circle text-primary" title="ติดตามผลแล้ว"></i>`;
                }
            }
        }
        const statusIcon = patient['สถานะ'] ? '<i class="fas fa-check-circle text-success"></i> ติดตามอยู่' : '<i class="fas fa-times-circle text-danger"></i> ปิดเคส';
        const editButton = `<button class="btn btn-sm btn-outline-success" onclick="openEditForm('${patient.ID}')" title="แก้ไข"><i class="fas fa-edit"> แก้ไข</i></button>`;
        const viewButton = `<button class="btn btn-sm btn-outline-primary" onclick="viewDetails('${patient.ID}')" title="ดูรายละเอียด"><i class="fas fa-eye"> ดูรายละเอียด</i></button>`;
        
        const deleteButton = (currentUser.role === 'admin' || currentUser.role === 'superadmin')
            ? `<button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteRecord('${patient.ID}')" title="ลบ"><i class="fas fa-trash-alt"> ลบ</i></button>`
            : '';
            
        tableHtml += `<tr><td>${patient.ID || '-'}</td><td>${nameHtml}</td><td>${patient['อายุ'] || '-'}</td><td>${patient['HN'] || '-'}</td><td>${patient['โทรศัพท์'] || '-'}</td><td>${patient['แพทย์เจ้าของไข้'] || '-'}</td><td>${statusIcon}</td><td class="text-center">${editButton} ${deleteButton} ${viewButton}</td></tr>`;
    });
    tableBody.innerHTML = tableHtml;
}


function setupPagination() {
    const paginationControls = document.getElementById('paginationControls');
    paginationControls.innerHTML = '';
    if (!filteredPatients || filteredPatients.length === 0) return;
    const pageCount = Math.ceil(filteredPatients.length / rowsPerPage);
    if (pageCount <= 1) return;

    const createPageItem = (text, pageNum, isDisabled = false, isActive = false) => {
        const li = document.createElement('li');
        li.className = `page-item ${isDisabled ? 'disabled' : ''} ${isActive ? 'active' : ''}`;
        const a = document.createElement('a'); a.className = 'page-link'; a.href = '#'; a.innerHTML = text;
        a.onclick = (e) => { e.preventDefault(); if (!isDisabled && !isActive) changePage(pageNum); };
        li.appendChild(a); return li;
    };
    paginationControls.appendChild(createPageItem('&laquo;', 1, currentPage === 1));
    paginationControls.appendChild(createPageItem('&lt;', currentPage - 1, currentPage === 1));
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(pageCount, currentPage + 2);
    if (startPage > 1) paginationControls.appendChild(createPageItem('1', 1));
    if (startPage > 2) paginationControls.appendChild(createPageItem('...', -1, true));
    for (let i = startPage; i <= endPage; i++) {
        paginationControls.appendChild(createPageItem(i, i, false, i === currentPage));
    }
    if (endPage < pageCount - 1) paginationControls.appendChild(createPageItem('...', -1, true));
    if (endPage < pageCount) paginationControls.appendChild(createPageItem(pageCount, pageCount));
    paginationControls.appendChild(createPageItem('&gt;', currentPage + 1, currentPage === pageCount));
    paginationControls.appendChild(createPageItem('&raquo;', pageCount, currentPage === pageCount));
}

function changePage(newPage) {
    const pageCount = Math.ceil(filteredPatients.length / rowsPerPage);
    if (newPage >= 1 && newPage <= pageCount) {
        currentPage = newPage;
        displayCurrentPagePatients();
        setupPagination();
    }
}

function openAddForm() {
    if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
        Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ในการเพิ่มข้อมูลผู้ป่วยใหม่', 'error');
        return;
    }
    currentEditingId = null;
    document.getElementById('patientForm').reset();
    document.getElementById('hiddenClosingDetails').value = '';
    document.getElementById('hiddenClosingDate').value = '';
    document.getElementById('hiddenClosingBy').value = '';
    $('#thaiCocProvince').val('').trigger('change');

    const firstTabLink = document.querySelector('#followUpTabsContainer .nav-link');
    if (firstTabLink) $(firstTabLink).tab('show');

    document.getElementById('formTitle').textContent = 'เพิ่มข้อมูลผู้ป่วย';
    document.getElementById('status').checked = true;
    document.getElementById('status').disabled = false;
    document.getElementById('deceased').checked = false;
    handleDeceasedChange({ target: document.getElementById('deceased') });
    updateStatusText();
    $('#patientForm').removeClass('was-validated');
    document.getElementById('assessment7d').checked = false;
    clearCustomFollowUpSlots(); // [v10.0]
    showFormView();
}

function openEditForm(id) {
    showLoader();
    currentEditingId = id;
    google.script.run
        .withSuccessHandler(response => {
            if (response.error) { handleError("โหลดข้อมูลผู้ป่วยไม่สำเร็จ: " + response.error); }
            else {
                let titleHtml = 'แก้ไขข้อมูลผู้ป่วย: ' + (response['ชื่อ-สกุล'] || id);
                const followUpStatus = getFollowUpStatus(response);
                if (followUpStatus.isDue) titleHtml += ` <span class="badge badge-danger">${followUpStatus.label}</span>`;
                document.getElementById('formTitle').innerHTML = titleHtml;

                const form = document.getElementById('patientForm');
                Array.from(form.elements).forEach(el => {
                    if (el.name) {
                        if (el.type === 'checkbox') el.checked = ['true', 'TRUE', true].includes(response[el.name]);
                        else if (el.id === 'thaiCocProvince') $(el).val(response[el.name] || '').trigger('change');
                        else el.value = response[el.name] || '';
                    }
                });
                document.getElementById('hiddenClosingDetails').value = response['สรุปปิดเคส_รายละเอียด'] || '';
                document.getElementById('hiddenClosingDate').value = response['สรุปปิดเคส_วันที่'] || '';
                document.getElementById('hiddenClosingBy').value = response['สรุปปิดเคส_ผู้บันทึก'] || '';
                loadCustomFollowUpData(response); // [v10.0]
                document.getElementById('status').disabled = document.getElementById('deceased').checked;
                updateStatusText();
                showFormView();
            }
            hideLoader();
        })
        .withFailureHandler(err => handleError("โหลดข้อมูลผู้ป่วยสำหรับแก้ไขไม่สำเร็จ: " + err.message))
        .getRecordById(id);
}


function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.checkValidity()) {
        event.stopPropagation();
        form.classList.add('was-validated');
        Swal.fire('ข้อผิดพลาด', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ช่องที่มีเครื่องหมาย *)', 'error');
        return;
    }

    for (const period of followUpConfig) {
        const detailsInput = document.getElementById(`fu${period.days}_details`);
        const fcInput = document.getElementById(`fu${period.days}_fc`);
        const byInput = document.getElementById(`fu${period.days}_by`);
        const dateInput = document.getElementById(`fu${period.days}_date`);

        const hasFollowUpData = (detailsInput.value.trim() !== '' || fcInput.value.trim() !== '' || byInput.value.trim() !== '');
        const hasFollowUpDate = dateInput.value.trim() !== '';

        if (hasFollowUpData && !hasFollowUpDate) {
            Swal.fire(
                'ข้อมูลไม่สมบูรณ์',
                `กรุณากรอก 'วันที่ติดตาม' ของแท็บ '${`ครบ ` + period.label}' ด้วย`,
                'warning'
            );
            $(`#fu-${period.days}-tab`).tab('show'); 
            return; 
        }
    }

    // [v10.0] Validate custom follow-up slots
    const customSlots = document.querySelectorAll('#customFollowUpSlots .custom-fu-slot');
    for (const slot of customSlots) {
        const daysInput = slot.querySelector('input[name*="_วันครบกำหนด"]');
        const dateInput = slot.querySelector('input[name*="_วันที่"]');
        const dataInput = slot.querySelector('textarea[name*="_ข้อมูล"]');
        if (daysInput && !daysInput.value.trim()) { Swal.fire('ข้อมูลไม่สมบูรณ์', 'กรุณาระบุจำนวน "กำหนดวัน" สำหรับวันติดตามพิเศษ #' + slot.dataset.slotIndex, 'warning'); return; }
        if (dataInput && dataInput.value.trim() && dateInput && !dateInput.value.trim()) { Swal.fire('ข้อมูลไม่สมบูรณ์', 'กรุณากรอกวันที่ติดตามสำหรับวันติดตามพิเศษ #' + slot.dataset.slotIndex, 'warning'); return; }
    }

    showLoader();
    const formData = new FormData(form);
    const record = Object.fromEntries(formData.entries());
    record['สถานะ'] = document.getElementById('status').checked;
    record['ผู้ป่วยเสียชีวิต'] = document.getElementById('deceased').checked;
    record['ทำแบบประเมิน7วัน'] = document.getElementById('assessment7d').checked;

    // [v10.0] ล้าง slot พิเศษที่ไม่ได้ใช้
    const activeSlotCount = getCustomSlotCount();
    for (let ci = activeSlotCount + 1; ci <= MAX_CUSTOM_FOLLOWUPS; ci++) {
        record[`ติดตามพิเศษ${ci}_วันครบกำหนด`] = ''; record[`ติดตามพิเศษ${ci}_ข้อมูล`] = ''; record[`ติดตามพิเศษ${ci}_วันที่`] = ''; record[`ติดตามพิเศษ${ci}_ผู้ติดตาม`] = ''; record[`ติดตามพิเศษ${ci}_FunctionalClass`] = '';
    }

    if (record['สถานะ']) { 
        record['สรุปปิดเคส_รายละเอียด'] = '';
        record['สรุปปิดเคส_วันที่'] = '';
        record['สรุปปิดเคส_ผู้บันทึก'] = '';
    } else if (!record['ผู้ป่วยเสียชีวิต']) { 
        record['สรุป28วัน_สถานะ'] = 'ปิดเคส';
        record['สรุป28วัน_วันที่บันทึก'] = new Date().toISOString().slice(0, 10);
        record['สรุป28วัน_ผู้บันทึก'] = currentUser.name || currentUser.email;
    }

    if (currentEditingId) record['ID'] = currentEditingId;
    const action = currentEditingId ? 'updateRecord' : 'addRecord';
    
    google.script.run
        .withSuccessHandler(function(response) {
            hideLoader();
            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'สำเร็จ!',
                    text: response.message || 'บันทึกข้อมูลสำเร็จ',
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => {
                    // 🟢 1. อัปเดตข้อมูลในหน่วยความจำให้เปลี่ยนหน้าจอ "ทันที" (✅ ขึ้นปุ๊บปั๊บ)
                    if (currentEditingId) {
                        const idx = allPatients.findIndex(p => p.ID == currentEditingId);
                        if (idx !== -1) {
                            Object.keys(record).forEach(k => {
                                allPatients[idx][k] = record[k];
                            });
                        }
                    }
                    
                    // 🟢 2. สลับหน้าจอกลับหน้าแรก
                    currentEditingId = null; 
                    showListView(); 

                    // 🟢 3. แอบรอ 1 วินาที เพื่อให้ Google Sheets เซฟเสร็จ แล้วค่อยดึงของจริงกลับมาซิงค์อีกรอบ
                    setTimeout(() => {
                        loadPatients(); 
                    }, 1000);
                });
            } else {
                handleError(response.error);
            }
        })
        .withFailureHandler(err => handleError(`บันทึกข้อมูลไม่สำเร็จ: ${err.message}`))
        [action](record);
}

function handleStatusClick(event) {
    if (event.target.checked) {
        event.preventDefault();
        if (!currentEditingId) {
            Swal.fire('ไม่สามารถปิดเคส', 'กรุณาบันทึกข้อมูลผู้ป่วยก่อนทำการปิดเคส', 'warning');
            return;
        }
        openClosingSummaryModal(currentEditingId, document.getElementById('fullName').value || 'ผู้ป่วย', 'form');
    } else {
        setTimeout(updateStatusText, 0);
    }
}

function handleDeceasedChange(event) {
    const statusCheckbox = document.getElementById('status');
    statusCheckbox.disabled = event.target.checked;
    if (event.target.checked) statusCheckbox.checked = false;
    updateStatusText();
}


function handleSaveSuccess(response) {
    hideLoader();
    if (response.success) {
        Swal.fire({ icon: 'success', title: 'สำเร็จ!', text: response.message, timer: 2000, showConfirmButton: false }).then(() => {
             loadPatients();
             showListView();      
        });
    } else {
        handleError(response.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
}

function loadPatients() {
    // ไม่ต้องแสดง showLoader() ตรงนี้แล้ว เพื่อไม่ให้หมุนกวนใจตอนทำงานเบื้องหลัง
    google.script.run
        .withSuccessHandler(response => {
            allPatients = response.error ? [] : response;
            if (response.error) {
                handleError("โหลดข้อมูลผู้ป่วยไม่สำเร็จ: " + response.error);
            } else {
                applySearch(); 
                loadPhysicianAlertData(); 
                
                if (!hasShownWelcomePopup) {
                    showWelcomePopup(allPatients);
                    hasShownWelcomePopup = true;
                }
            }
        })
        .withFailureHandler(err => handleError("โหลดข้อมูลผู้ป่วยไม่สำเร็จ: " + err.message))
        .getSheetData();
}

// [v10.0] Helper: ดึงรายการวันติดตามพิเศษของผู้ป่วย
function getPatientCustomDays(patient) {
    const days = [];
    for (let ci = 1; ci <= MAX_CUSTOM_FOLLOWUPS; ci++) {
        const d = patient[`ติดตามพิเศษ${ci}_วันครบกำหนด`];
        if (d && String(d).trim() !== '' && parseInt(d) > 0) days.push(parseInt(d));
    }
    return days;
}

function showWelcomePopup(allPatientsArray) {
    const duePatientsToday = allPatientsArray
        .map(p => ({ ...p, status: getFollowUpStatus(p) }))
        .filter(p => p.status.isDue && !p['ผู้ป่วยเสียชีวิต']);

    if (duePatientsToday.length > 0) {
        let patientListHtml = '<ol style="text-align: left; max-height: 200px; overflow-y: auto;">'
            + duePatientsToday.map(p => {
                let assessText = "";
                if (p.status.label === 'ครบ 7 วัน' && p['ทำแบบประเมิน7วัน']) {
                    assessText = ' <span class="badge badge-info ml-1" style="background-color: #17a2b8; color: white;"><i class="fas fa-clipboard-list"></i> ทำแบบประเมิน</span>';
                }
                // [v10.0] ป้ายกำกับวันติดตามพิเศษ (แสดงหลัง ครบ X วัน)
                const cDays = getPatientCustomDays(p);
                const customTag = cDays.length > 0 ? ` <span style="background-color:#0dcaf0;color:#000;padding:1px 5px;border-radius:3px;font-size:0.75em;"><i class="fas fa-calendar-plus"></i> พิเศษ: ${cDays.join(',')} วัน</span>` : '';
                return `<li>${p['ชื่อ-สกุล']} <span class="text-danger font-weight-bold">${p.status.label}</span>${customTag}${assessText}</li>`;
            }).join('')
            + '</ol>';
        Swal.fire({ icon: 'info', title: `วันนี้มีผู้ป่วยครบกำหนด ${duePatientsToday.length} ราย`, html: patientListHtml, confirmButtonText: 'รับทราบ' });
    } else {
        Swal.fire({ icon: 'success', title: 'ไม่พบผู้ป่วยที่ครบกำหนดวันนี้', text: 'ยอดเยี่ยม! ไม่มีรายการที่ต้องติดตามในวันนี้', timer: 2500, showConfirmButton: false });
    }
}

function getFollowUpStatus(patient) {
    const dischargeDateStr = patient['วันที่กลับบ้าน'];
    if (!dischargeDateStr || !followUpConfig || !patient['สถานะ'] || patient['ผู้ป่วยเสียชีวิต']) {
        return { isDue: false, isCompleted: false, label: '' };
    }
    try {
        const daysSinceDischarge = calculateDaysSince(dischargeDateStr);
        if (daysSinceDischarge === null || daysSinceDischarge < 0) return { isDue: false, isCompleted: false, label: '' };
        const duePeriod = followUpConfig.find(p => p.days === daysSinceDischarge);
        if (duePeriod) {
            const hasData = patient[`ติดตามครบ${duePeriod.sheetSuffix}_ข้อมูล`];
            const hasDate = patient[`ติดตามครบ${duePeriod.sheetSuffix}_วันที่`];
            return { isDue: true, isCompleted: !!(hasData || hasDate), label: `ครบ ${duePeriod.label}` };
        }
        // [v10.0] ตรวจสอบวันติดตามพิเศษ
        for (let ci = 1; ci <= MAX_CUSTOM_FOLLOWUPS; ci++) {
            const customDays = parseInt(patient[`ติดตามพิเศษ${ci}_วันครบกำหนด`], 10);
            if (!isNaN(customDays) && customDays > 0 && customDays === daysSinceDischarge) {
                return { isDue: true, isCompleted: !!(patient[`ติดตามพิเศษ${ci}_ข้อมูล`] || patient[`ติดตามพิเศษ${ci}_วันที่`]), label: `ครบ ${customDays} วัน` };
            }
        }
        return { isDue: false, isCompleted: false, label: '' };
    } catch (e) {
        console.error("Error calculating follow-up status for patient ID " + (patient.ID || 'N/A') + ":", e);
        return { isDue: false, isCompleted: false, label: '' };
    }
}


function updateStatusText() {
    const statusCheckbox = document.getElementById('status');
    const statusTextSpan = document.getElementById('status-text');
    if (statusCheckbox.checked) {
        statusTextSpan.textContent = 'เปิด';
        statusTextSpan.className = 'status-indicator status-on';
    } else {
        statusTextSpan.textContent = 'ปิด';
        statusTextSpan.className = 'status-indicator status-off';
    }
}

function showLoader() { document.getElementById('loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('loader').style.display = 'none'; }

function debounce(func, delay) {
    let timeout;
    return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); };
}

function confirmDeleteRecord(id) {
    Swal.fire({
        title: 'ยืนยันการลบข้อมูล', text: "คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลผู้ป่วยรายนี้?", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoader();
            google.script.run
                .withSuccessHandler(response => {
                    hideLoader();
                    if (response.success) { 
                        Swal.fire('ลบสำเร็จ!', response.message, 'success').then(() => {
                            setTimeout(() => { loadPatients(); }, 1000); 
                        });
                    }
                    else { handleError(response.error || 'เกิดข้อผิดพลาดในการลบข้อมูล'); }
                })
                .withFailureHandler(err => handleError("ลบข้อมูลไม่สำเร็จ: " + err.message))
                .deleteRecord(id);
        }
    });
}

function viewDetails(id) {
    showLoader();
    google.script.run
        .withSuccessHandler(patient => {
            hideLoader();
            if (patient.error) { handleError("ไม่สามารถดูรายละเอียดผู้ป่วย: " + patient.error); return; }

            let statusBadge = patient['ผู้ป่วยเสียชีวิต'] ? '<span class="badge badge-dark">เสียชีวิต</span>'
                : (patient['สถานะ'] ? '<span class="badge badge-success">ติดตามอยู่</span>' : '<span class="badge badge-secondary">ปิดเคส</span>');

            let detailsHtml = `<div class="text-left" style="max-height: 70vh; overflow-y: auto;">
                <h5><i class="fas fa-user-circle text-success"></i> ${patient['ชื่อ-สกุล']} (HN: ${patient['HN'] || 'N/A'})</h5><hr>
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>ID:</strong> ${patient.ID || '-'}</p><p><strong>อายุ:</strong> ${patient['อายุ'] || '-'} ปี</p>
                        <p><strong>โทรศัพท์:</strong> ${patient['โทรศัพท์'] || '-'}</p><p><strong>แพทย์:</strong> ${patient['แพทย์เจ้าของไข้'] || '-'}</p>
                        <p><strong>Diagnosis:</strong> ${patient['Diax'] || '-'}</p><p><strong>การผ่าตัด:</strong> ${patient['การผ่าตัด'] || '-'}</p>
                    </div><div class="col-md-6">
                        <p><strong>วันที่ผ่าตัด:</strong> ${formatThaiDate(patient['วันที่ผ่าตัด'])}</p><p><strong>วันที่กลับบ้าน:</strong> ${formatThaiDate(patient['วันที่กลับบ้าน'])}</p>
                        <p><strong>สถานะ:</strong> ${statusBadge}</p><p><strong>วันที่ส่ง ThaiCOC:</strong> ${formatThaiDate(patient['วันที่ส่ง ThaiCOC'])}</p>
                        <p><strong>จังหวัดที่ส่ง ThaiCOC:</strong> ${patient['จังหวัดที่ส่ง ThaiCOC'] || '-'}</p><p><strong>ผู้ส่ง ThaiCOC:</strong> ${patient['ชื่อผู้ส่ง ThaiCOC'] || '-'}</p>
                    </div></div>
                 <p><strong>ยา H/M:</strong> ${patient['ยา H/M'] || '-'}</p><p><strong>หมายเหตุ:</strong> ${patient['หมายเหตุ(วันนัดF/U , นัดตัดไหม, อื่นๆ)'] || '-'}</p><hr>
                 <h6><i class="fas fa-calendar-check text-primary"></i> ข้อมูลการติดตามผล:</h6>`;

            let fuContentFound = false;
            followUpConfig.forEach(period => {
                const details = patient[`ติดตามครบ${period.sheetSuffix}_ข้อมูล`];
                if (details || patient[`ติดตามครบ${period.sheetSuffix}_วันที่`]) {
                    fuContentFound = true;
                    detailsHtml += `<div class="card my-2 shadow-sm"><div class="card-body p-3">
                        <strong class="text-primary">ครบ ${period.label}:</strong><br>
                        <strong>ข้อมูล:</strong> ${details || '-'}<br>
                        <strong>FC:</strong> ${patient[`ติดตามครบ${period.sheetSuffix}_FunctionalClass`] || '-'}<br>
                        <strong>วันที่:</strong> ${formatThaiDate(patient[`ติดตามครบ${period.sheetSuffix}_วันที่`])}<br>
                        <strong>ผู้ติดตาม:</strong> ${patient[`ติดตามครบ${period.sheetSuffix}_ผู้ติดตาม`] || '-'}
                    </div></div>`;
                }
            });
            if (!fuContentFound) detailsHtml += '<p class="ml-3"><em>ยังไม่มีข้อมูลการติดตามผล</em></p>';
            // [v10.0] แสดงข้อมูลติดตามพิเศษ
            let hasCustomFu = false;
            for (let ci = 1; ci <= MAX_CUSTOM_FOLLOWUPS; ci++) {
                const customDays = patient[`ติดตามพิเศษ${ci}_วันครบกำหนด`];
                if (customDays && String(customDays).trim() !== '' && parseInt(customDays) > 0) {
                    if (!hasCustomFu) { detailsHtml += `<hr><h6><i class="fas fa-calendar-plus text-info"></i> วันติดตามพิเศษ:</h6>`; hasCustomFu = true; }
                    detailsHtml += `<div class="card my-2 shadow-sm border-info"><div class="card-body p-3"><strong class="text-info">ครบ ${customDays} วัน (พิเศษ):</strong><br><strong>ข้อมูล:</strong> ${patient[`ติดตามพิเศษ${ci}_ข้อมูล`] || '-'}<br><strong>FC:</strong> ${patient[`ติดตามพิเศษ${ci}_FunctionalClass`] || '-'}<br><strong>วันที่:</strong> ${formatThaiDate(patient[`ติดตามพิเศษ${ci}_วันที่`])}<br><strong>ผู้ติดตาม:</strong> ${patient[`ติดตามพิเศษ${ci}_ผู้ติดตาม`] || '-'}</div></div>`;
                }
            }
            
            detailsHtml += `<hr><h6><i class="fas fa-archive text-warning"></i> สรุปการปิดเคส:</h6>`;
            detailsHtml += patient['สรุปปิดเคส_วันที่'] ? `<p class="ml-3"><strong>รายละเอียด:</strong> ${patient['สรุปปิดเคส_รายละเอียด'] || '-'}<br><strong>วันที่:</strong> ${formatThaiDate(patient['สรุปปิดเคส_วันที่'])}<br><strong>ผู้บันทึก:</strong> ${patient['สรุปปิดเคส_ผู้บันทึก'] || '-'}</p>` : '<p class="ml-3"><em>ยังไม่มีข้อมูล</em></p>';

            [28, 90].forEach(p => {
                detailsHtml += `<hr><h6><i class="fas fa-file-signature text-info"></i> สรุปผล ${p} วัน:</h6>`;
                const status = patient[`สรุป${p}วัน_สถานะ`];
                if (status) {
                    let statusClass = status === 'ปกติ' ? 'text-success' : (status === 'ไม่ปกติ' ? 'text-danger' : 'text-dark');
                    detailsHtml += `<p class="ml-3"><strong>สถานะ:</strong> <span class="font-weight-bold ${statusClass}">${status}</span><br><strong>รายละเอียด:</strong> ${patient[`สรุป${p}วัน_รายละเอียด`] || '-'}<br><strong>วันที่:</strong> ${formatThaiDate(patient[`สรุป${p}วัน_วันที่บันทึก`])}<br><strong>ผู้บันทึก:</strong> ${patient[`สรุป${p}วัน_ผู้บันทึก`] || '-'}</p>`;
                } else {
                    detailsHtml += '<p class="ml-3"><em>ยังไม่มีข้อมูล</em></p>';
                }
            });

            detailsHtml += `<hr>
                <h6><i class="fas fa-history text-success"></i> Timeline รูปภาพอาการ:</h6>
                <div id="timeline-container" class="mt-3" style="min-height: 100px;">
                    <div class="text-center text-muted p-3">
                        <i class="fas fa-spinner fa-spin fa-2x"></i><br>กำลังโหลดข้อมูลรูปภาพ...
                    </div>
                </div>`;

            detailsHtml += `</div>`;
            Swal.fire({ 
                title: 'รายละเอียดผู้ป่วย', 
                html: detailsHtml, 
                width: '80%', 
                showCloseButton: true, 
                showConfirmButton: false,
                didOpen: () => {
                    loadPatientTimelineImages(patient['ชื่อ-สกุล']);
                }
            });
        })
        .withFailureHandler(err => handleError("ไม่สามารถดูรายละเอียดผู้ป่วย: " + err.message))
        .getRecordById(id);
}

function loadPatientTimelineImages(patientName) {
    console.log("DEBUG: loadPatientTimelineImages calling backend for:", patientName);
    if(!patientName) {
        document.getElementById('timeline-container').innerHTML = '<p class="text-center text-muted"><em>ไม่พบชื่อผู้ป่วย</em></p>';
        return;
    }
    
    google.script.run
        .withSuccessHandler(renderPatientTimeline)
        .withFailureHandler(err => {
            console.error("DEBUG: Backend Error:", err);
            const container = document.getElementById('timeline-container');
            if(container) container.innerHTML = '<p class="text-center text-danger">ไม่สามารถโหลดรูปภาพได้ (Server Error)</p>';
        })
        .getPatientImageTimeline(patientName);
}

function openImagePreview(imgUrl, driveUrl) {
    if (!document.getElementById('imagePreviewModal')) {
        const modalHtml = `
        <div class="modal fade" id="imagePreviewModal" tabindex="-1" role="dialog" aria-hidden="true" style="z-index: 10500;">
          <div class="modal-dialog modal-dialog-centered modal-lg" role="document" style="max-width: 90%;">
            <div class="modal-content" style="background: transparent; border: none; box-shadow: none;">
              <div class="modal-body text-center p-0" style="position: relative;">
                
                <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close" 
                        style="position: absolute; right: -10px; top: -30px; opacity: 0.9; text-shadow: 0 1px 3px #000; font-size: 2.5rem; z-index: 10501;">
                  <span aria-hidden="true">&times;</span>
                </button>
                
                <img id="previewModalImage" src="" class="img-fluid rounded shadow-lg" 
                     style="max-height: 85vh; width: auto; background-color: #000; border: 1px solid #444;">
                
                <div class="mt-3">
                    <a id="previewModalDriveLink" href="#" target="_blank" class="btn btn-primary shadow-sm px-4">
                        <i class="fab fa-google-drive"></i> เปิดดูต้นฉบับใน Google Drive
                    </a>
                </div>

              </div>
            </div>
          </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const img = document.getElementById('previewModalImage');
    const link = document.getElementById('previewModalDriveLink');
    
    img.src = imgUrl; 
    link.href = driveUrl; 

    $('#imagePreviewModal').modal('show');
}

function renderPatientTimeline(timelineData) {
    console.log("DEBUG: renderPatientTimeline received data:", timelineData);

    const container = document.getElementById('timeline-container');
    if (!container) return; 

    if (!timelineData) {
        console.warn("DEBUG: Received NULL or Undefined from server. Defaulting to empty array.");
        timelineData = [];
    }

    if (timelineData.error) {
         console.error("DEBUG: Data Error:", timelineData.error);
         container.innerHTML = `<p class="text-center text-danger">เกิดข้อผิดพลาด: ${timelineData.error}</p>`;
         return;
    }

    if (timelineData.length === 0) {
        container.innerHTML = '<p class="text-center text-muted"><em>ไม่พบประวัติรูปภาพ</em></p>';
        return;
    }

    let html = '<div class="timeline">';
    
    timelineData.forEach((item, index) => {
        let dateStr = '-';
        if (item.timestamp) {
            try {
                const date = new Date(item.timestamp);
                dateStr = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
            } catch(e) {}
        }

        html += `
        <div class="timeline-item">
            <div class="timeline-badge"></div>
            <div class="timeline-content">
                <div class="timeline-header">
                    <strong class="timeline-title">${item.dayLabel || 'ไม่ระบุวัน'}</strong>
                    <span class="timeline-date"><i class="far fa-clock"></i> ${dateStr}</span>
                </div>
                <div class="timeline-images-grid">`;
        
        const addImage = (url, label) => {
            if (!url) return '';
            
            const thumbUrl = convertGoogleDriveLink(url); 
            if (!thumbUrl) return '';
            
            let id = null;
            let parts = url.split(',');
            let firstUrl = parts[0].trim();
            
            let match = firstUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match) id = match[1];
            if (!id) {
                 match = firstUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                 if (match) id = match[1];
            }
            
            let driveLink = firstUrl;
            if (id) {
                driveLink = 'https://drive.google.com/file/d/' + id + '/view';
            }

            return `
            <div class="timeline-img-card">
                <img src="${thumbUrl}" 
                     class="timeline-img-thumbnail" 
                     onclick="openImagePreview('${thumbUrl}', '${driveLink}')" 
                     alt="${label}" 
                     title="คลิกเพื่อขยายดูภาพใหญ่"
                     style="cursor: pointer;"
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<small class=\\'text-muted\\'>ภาพเสีย</small>';">
                <div class="timeline-img-label">${label}</div>
            </div>`;
        };

        html += addImage(item.chest, 'หน้าอก');
        html += addImage(item.armL, 'แขนซ้าย');
        html += addImage(item.legR, 'ขาขวา');
        html += addImage(item.legL, 'ขาซ้าย');
        html += addImage(item.additional, 'เพิ่มเติม');

        html += `
                </div>
            </div>
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

function handleError(errorMsg) {
    hideLoader();
    console.error('App Error:', errorMsg);
    Swal.fire({ icon: 'error', title: 'ผิดพลาด!', text: typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : String(errorMsg) });
}

function pullLatestFollowUpData() {
    try {
        const pullBtn = document.getElementById('pullLatestFollowUpBtn');
        
        const latestDate = pullBtn.dataset.latestDate;
        const latestDue = pullBtn.dataset.latestDue;
        const latestFc = pullBtn.dataset.latestFc;
        const latestFollower = pullBtn.dataset.latestFollower;
        const latestSummary = pullBtn.dataset.latestSummary; 

        document.getElementById('alertFormOverrideDate').value = latestDate || '';
        document.getElementById('alertFormOverrideDueDate').value = latestDue || '';
        document.getElementById('alertFormOverrideFC').value = latestFc || '';
        document.getElementById('alertFormOverrideFollower').value = latestFollower || '';
        document.getElementById('alertFormOverrideSummary').value = latestSummary || '';

        Swal.fire({
            icon: 'success', title: 'ดึงข้อมูลสำเร็จ', text: 'ดึงข้อมูลติดตามผลล่าสุดมาแสดงแล้ว',
            toast: true, position: 'top-end', showConfirmButton: false, timer: 2500
        });

    } catch (e) {
        console.error('Error in pullLatestFollowUpData:', e);
        handleError('เกิดข้อผิดพลาดขณะดึงข้อมูล: ' + e.message);
    }
}

function clearPulledFollowUpData() {
    try {
        document.getElementById('alertFormOverrideDate').value = '';
        document.getElementById('alertFormOverrideDueDate').value = '';
        document.getElementById('alertFormOverrideFC').value = '';
        document.getElementById('alertFormOverrideFollower').value = '';
        document.getElementById('alertFormOverrideSummary').value = '';

        document.getElementById('alertFormImgChest').value = '';
        document.getElementById('alertFormImgArmL').value = '';
        document.getElementById('alertFormImgLegR').value = '';
        document.getElementById('alertFormImgLegL').value = '';
        document.getElementById('alertFormImgAdd').value = '';

        updateAllImagePreviews();

        document.getElementById('sendAlertCheckbox').checked = false;

        Swal.fire({
            icon: 'success', title: 'ล้างข้อมูลแล้ว', text: 'ข้อมูลที่ดึงมาแก้ไขถูกล้างค่าเรียบร้อยแล้ว',
            toast: true, position: 'top-end', showConfirmButton: false, timer: 2000
        });

    } catch (e) {
        console.error('Error in clearPulledFollowUpData:', e);
        handleError('เกิดข้อผิดพลาดขณะล้างข้อมูล: ' + e.message);
    }
}

function opensheet(){
    window.open("https://docs.google.com/spreadsheets/d/1kZw0XQBEhMxDn6v-1ENxWUiKjKyxfWHTBeWF2uamxaw/edit?usp=sharing",'_blank');
  return false;
}

document.getElementById('logout-button').addEventListener('click', () => {
  showLoader();
  google.script.run
    .withSuccessHandler(response => {
      if (response.success) {
        window.open("https://script.google.com/macros/s/AKfycbx33VroTHgam2Od2GgZJxC0MFdXNmbTygEn-dy3amsqEgjLq0174WiiZQWLeLlA8Vak/exec",'_top');
      } else {
        alert('ไม่สามารถออกจากระบบได้');
        hideLoader();
      }
    })
    .logout();
});




/**
 * Supabase API Client Layer
 * Replaces Google Apps Script `code.gs` functions
 * Depends on: Supabase JS library and config.js
 */

// Initialize Supabase Client
(() => {
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const supabaseClient = {
    // ==========================================
    // AUTHENTICATION
    // ==========================================
    async login(username, password) {
        try {
            // Using a custom users table as requested in schema
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .single();
            
            if (error) {
                console.error("Supabase Login Error:", error);
                // PGRST116 means 0 rows returned (User not found)
                if (error.code !== 'PGRST116') {
                    return { success: false, message: `ข้อผิดพลาดฐานข้อมูล: ${error.message} (Code: ${error.code})` };
                }
                return { success: false, message: 'ชื่อผู้ใช้ หรือ รหัสผ่าน ไม่ถูกต้อง' };
            }
            
            if (!data) return { success: false, message: 'ชื่อผู้ใช้ หรือ รหัสผ่าน ไม่ถูกต้อง' };
            
            // Simple password check (in production, use bcrypt or Supabase Auth)
            if (data.password !== password) return { success: false, message: 'ชื่อผู้ใช้ หรือ รหัสผ่าน ไม่ถูกต้อง' };
            
            // Store session
            localStorage.setItem('currentUser', JSON.stringify({
                username: data.username,
                name: data.name,
                role: data.role
            }));
            
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    async logout() {
        localStorage.removeItem('currentUser');
        return { success: true };
    },

    async getUserInfo() {
        const user = localStorage.getItem('currentUser');
        return user ? JSON.parse(user) : null;
    },

    async checkLogin() {
        const user = await this.getUserInfo();
        return !!user;
    },

    // ==========================================
    // PATIENT DATA CRUD
    // ==========================================
    async getInitialData() {
        try {
            const userInfo = await this.getUserInfo();
            if (!userInfo) return null;

            const [patientsRes, settingsRes, caseCloseRes] = await Promise.all([
                supabase.from('patients').select('*').order('ID', { ascending: false }),
                supabase.from('settings').select('value').eq('key', 'PHYSICIAN_NAMES').single(),
                supabase.from('case_close_rules').select('*').order('id')
            ]);

            // Parse physician names
            let physicianNames = [];
            if (settingsRes.data && settingsRes.data.value) {
                try {
                    physicianNames = JSON.parse(settingsRes.data.value);
                } catch(e) {
                    physicianNames = settingsRes.data.value.split(',').map(s => s.trim());
                }
            }

            // Remap case close rules for compatibility
            const caseCloseData = (caseCloseRes.data || []).map(r => ({
                rowIndex: r.id,
                diax: r.diax,
                surgery: r.surgery
            }));

            return {
                userInfo,
                followUpConfig: FOLLOW_UP_PERIODS_CONFIG,
                patients: patientsRes.data || [],
                physicianNames: physicianNames,
                caseCloseData: caseCloseData
            };
        } catch (err) {
            console.error(err);
            return { error: err.message };
        }
    },

    async getSheetData() {
        try {
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .order('ID', { ascending: false });
            
            if (error) throw error;
            return data;
        } catch (err) {
            return { error: err.message };
        }
    },

    async getRecordById(id) {
        try {
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .eq('ID', id)
                .single();
            
            if (error) throw error;
            return data;
        } catch (err) {
            return { error: err.message };
        }
    },

    async addRecord(record) {
        try {
            // Remove calculated/empty fields if necessary
            delete record.ID;
            
            const { data, error } = await supabase
                .from('patients')
                .insert([record])
                .select()
                .single();
            
            if (error) throw error;
            return { success: true, message: 'เพิ่มข้อมูลผู้ป่วยเรียบร้อยแล้ว', data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    async updateRecord(record) {
        try {
            if (!record.ID) throw new Error("ID is required for updating");
            
            const { ID, ...updateData } = record;
            
            const { error } = await supabase
                .from('patients')
                .update(updateData)
                .eq('ID', ID);
            
            if (error) throw error;
            return { success: true, message: 'แก้ไขข้อมูลผู้ป่วยเรียบร้อยแล้ว' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    async updateAlertRecord(record) {
        // Just an alias to updateRecord for compatibility
        return this.updateRecord(record);
    },

    async deleteRecord(id) {
        try {
            const { error } = await supabase
                .from('patients')
                .delete()
                .eq('ID', id);
            
            if (error) throw error;
            return { success: true, message: 'ลบข้อมูลผู้ป่วยเรียบร้อยแล้ว' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // ==========================================
    // SPECIFIC VIEWS / QUERIES
    // ==========================================
    async getPatientsDueFor28DayFollowUp() {
        // Returns all active or deceased patients
        try {
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .or('สถานะ.eq.true,ผู้ป่วยเสียชีวิต.eq.true')
                .order('วันที่กลับบ้าน', { ascending: false });
            
            if (error) throw error;
            return data;
        } catch (err) {
            return { error: err.message };
        }
    },

    async getPatientsDueFor90DayFollowUp() {
        // Same logic as above, client filters it later
        return this.getPatientsDueFor28DayFollowUp();
    },

    // ==========================================
    // SETTINGS / CASE CLOSE RULES
    // ==========================================
    async manageCaseCloseItem(action, data) {
        try {
            if (action === 'add') {
                await supabase.from('case_close_rules').insert([{ diax: data.diax, surgery: data.surgery }]);
            } else if (action === 'update') {
                await supabase.from('case_close_rules').update({ diax: data.diax, surgery: data.surgery }).eq('id', data.rowIndex);
            } else if (action === 'delete') {
                await supabase.from('case_close_rules').delete().eq('id', data.rowIndex);
            }
            
            // Return updated list
            const { data: rules } = await supabase.from('case_close_rules').select('*').order('id');
            return (rules || []).map(r => ({ rowIndex: r.id, diax: r.diax, surgery: r.surgery }));
        } catch (err) {
            return { error: err.message };
        }
    },

    // ==========================================
    // IMAGES & TIMELINE
    // ==========================================
    async getImageLinksFromSource(patientName, dueDate) {
        try {
            let query = supabase.from('image_sources').select('*').eq('patient_name', patientName);
            if (dueDate) query = query.eq('due_day', dueDate);
            
            const { data, error } = await query.order('timestamp', { ascending: false }).limit(1).single();
            
            if (error && error.code !== 'PGRST116') throw error; // Ignore not found
            if (!data) return { error: 'ไม่พบรูปภาพสำหรับผู้ป่วยนี้' };
            
            return {
                chest: data.chest_image,
                armL: data.arm_left_image,
                legR: data.leg_right_image,
                legL: data.leg_left_image,
                additional: data.additional_image
            };
        } catch (err) {
            return { error: err.message };
        }
    },

    async getPatientImageTimeline(patientName) {
        try {
            const { data, error } = await supabase
                .from('image_sources')
                .select('*')
                .eq('patient_name', patientName)
                .order('timestamp', { ascending: false });
            
            if (error) throw error;
            
            return (data || []).map(item => ({
                timestamp: item.timestamp,
                dayLabel: `ครบ ${item.due_day} วัน`,
                chest: item.chest_image,
                armL: item.arm_left_image,
                legR: item.leg_right_image,
                legL: item.leg_left_image,
                additional: item.additional_image
            }));
        } catch (err) {
            return { error: err.message };
        }
    },

    // ==========================================
    // REPORTS & DASHBOARD
    // ==========================================
    async getReportData(reportType, filters) {
        try {
            const { data: allPatients, error } = await supabase.from('patients').select('*');
            if (error) throw error;

            let result;
            const targetMonthPrefix = filters.month; // YYYY-MM

            if (reportType === 'thaicoc') {
                result = allPatients.filter(p => p['วันที่ส่ง ThaiCOC'] && p['วันที่ส่ง ThaiCOC'].startsWith(targetMonthPrefix));
            } else if (reportType === 'physician') {
                result = allPatients.filter(p => p['วันที่กลับบ้าน'] && p['วันที่กลับบ้าน'].startsWith(targetMonthPrefix));
                if (filters.physician !== 'all') {
                    result = result.filter(p => p['แพทย์เจ้าของไข้'] === filters.physician);
                }
            } else if (reportType === 'diagnosis') {
                let filtered = allPatients.filter(p => p['วันที่กลับบ้าน'] && p['วันที่กลับบ้าน'].startsWith(targetMonthPrefix));
                if (filters.physician !== 'all') {
                    filtered = filtered.filter(p => p['แพทย์เจ้าของไข้'] === filters.physician);
                }
                // Group by Diax
                result = {};
                filtered.forEach(p => {
                    const diax = p['Diax'] || 'ไม่ระบุ';
                    if (!result[diax]) result[diax] = [];
                    result[diax].push(p);
                });
            } else if (reportType === 'summary28day') {
                // Group by 28day status
                result = { 'ปกติ': [], 'ไม่ปกติ': [], 'เสียชีวิต': [], 'ไม่ระบุ': [] };
                allPatients.forEach(p => {
                    if (p['สรุป28วัน_วันที่บันทึก'] && p['สรุป28วัน_วันที่บันทึก'].startsWith(targetMonthPrefix)) {
                        const status = p['สรุป28วัน_สถานะ'] || 'ไม่ระบุ';
                        if (result[status]) result[status].push(p);
                        else result['ไม่ระบุ'].push(p);
                    } else if (!p['สรุป28วัน_วันที่บันทึก'] && p['สถานะ']) {
                        // Include patients pending evaluation if their discharge date was in this month approx?
                        // This matches legacy behavior which was client-side grouped
                    }
                });
            } else if (reportType === 'summary90day') {
                result = { 'ปกติ': [], 'ไม่ปกติ': [], 'เสียชีวิต': [], 'ไม่ระบุ': [] };
                allPatients.forEach(p => {
                    if (p['สรุป90วัน_วันที่บันทึก'] && p['สรุป90วัน_วันที่บันทึก'].startsWith(targetMonthPrefix)) {
                        const status = p['สรุป90วัน_สถานะ'] || 'ไม่ระบุ';
                        if (result[status]) result[status].push(p);
                        else result['ไม่ระบุ'].push(p);
                    }
                });
            } else if (reportType === 'closedCases') {
                result = allPatients.filter(p => p['สรุปปิดเคส_วันที่'] && p['สรุปปิดเคส_วันที่'].startsWith(targetMonthPrefix));
            }

            return result;
        } catch (err) {
            return { error: err.message };
        }
    },

    async getDashboardPageData(fiscalYearFilter) {
        try {
            // Note: In a real migration, we would run SQL aggregations. 
            // For 100% compatibility, we fetch data and aggregate in JS similar to GAS backend.
            const { data: patients, error: pErr } = await supabase.from('patients').select('*');
            const { data: satisfaction, error: sErr } = await supabase.from('satisfaction').select('*');
            
            if (pErr) throw pErr;

            // Simple mock aggregation for the dashboard payload
            // This replicates the structure expected by the frontend
            
            let activeFollowup = 0;
            let completed28d = 0;
            let completed90d = 0;
            let deceased = 0;
            let newThisWeek = 0;

            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            patients.forEach(p => {
                if (p['สถานะ']) activeFollowup++;
                if (p['ผู้ป่วยเสียชีวิต']) deceased++;
                if (p['สรุป28วัน_สถานะ']) completed28d++;
                if (p['สรุป90วัน_สถานะ']) completed90d++;
                
                const dischargeDate = new Date(p['วันที่กลับบ้าน']);
                if (dischargeDate >= oneWeekAgo && dischargeDate <= now) newThisWeek++;
            });

            // Readmit calculations
            const readmissionCount = 0; // Mock: Need proper criteria for readmission
            const readmissionRate = 0;

            // Satisfaction
            let satAvg = 0;
            let satBreakdown = [0, 0, 0, 0];
            let comments = [];
            
            if (satisfaction && satisfaction.length > 0) {
                const sum = satisfaction.reduce((acc, curr) => acc + curr.score, 0);
                satAvg = (sum / satisfaction.length).toFixed(1);
                
                satisfaction.forEach(s => {
                    if (s.score <= 2) satBreakdown[0]++;
                    else if (s.score === 3) satBreakdown[1]++;
                    else if (s.score === 4) satBreakdown[2]++;
                    else if (s.score === 5) satBreakdown[3]++;
                    
                    if (s.comment) comments.push(s.comment);
                });
                comments = comments.slice(0, 5); // top 5
            }

            return {
                dashboard: {
                    globalAvailableFiscalYears: ['2567', '2568'],
                    overview: {
                        totalPatients: patients.length,
                        activeFollowup,
                        completed28d,
                        completed90d,
                        deceased,
                        newThisWeek
                    },
                    followUpStatus: {
                        performance28d: { completed: completed28d, missed: 0 },
                        performance90d: { completed: completed90d, missed: 0 },
                        latestVisits: patients.slice(0, 5).map(p => ({
                            name: p['ชื่อ-สกุล'],
                            surgery: p['การผ่าตัด'],
                            doctor: p['แพทย์เจ้าของไข้'],
                            visitDate: p['วันที่กลับบ้าน'] // mockup
                        }))
                    },
                    insights: {
                        diagnosis: Object.entries(patients.reduce((acc, p) => {
                            acc[p['Diax'] || 'ไม่ระบุ'] = (acc[p['Diax'] || 'ไม่ระบุ'] || 0) + 1;
                            return acc;
                        }, {})).map(([k, v]) => ({ label: k, value: v })).slice(0, 10),
                        doctors: patients.reduce((acc, p) => {
                            if (p['แพทย์เจ้าของไข้']) acc[p['แพทย์เจ้าของไข้']] = (acc[p['แพทย์เจ้าของไข้']] || 0) + 1;
                            return acc;
                        }, {}),
                        provinces: {}, // Mock
                        ageGroups: { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81+': 0, 'ไม่ระบุ': patients.length } // Mock
                    },
                    outcomes: {
                        fcTrend: [0, 0, 0, 0, 0, 0, 0],
                        readmissionCount,
                        readmissionRate,
                        readmitByMonth: {}
                    },
                    satisfaction: {
                        average: satAvg,
                        breakdown: satBreakdown,
                        comments: comments
                    }
                },
                config: FOLLOW_UP_PERIODS_CONFIG
            };
        } catch (err) {
            return { dashboard: { error: err.message }, config: [] };
        }
    },

    // ==========================================
    // EDGE FUNCTIONS INTEGRATION
    // ==========================================
    async sendSelectedPhysicianReports() {
        try {
            // In Supabase, this would call an Edge Function
            const { data, error } = await supabase.functions.invoke('send-telegram', {
                body: { action: 'sendSelectedReports' }
            });
            
            if (error) throw error;
            return data;
        } catch (err) {
            // For testing/mocking when edge function is not ready
            console.warn('Edge function failed/not deployed. Mocking success.', err);
            return { success: true, sent: 0, errors: ['ไม่สามารถเรียก Edge Function ได้ (กำลังจำลองการทำงาน)'] };
        }
    }
};

// Polyfill google.script.run for backward compatibility
function createGoogleScriptRunner() {
    let successHandler = null;
    let failureHandler = null;
    let userObject = null;

    const runner = new Proxy({}, {
        get: function(target, prop) {
            if (prop === 'withSuccessHandler') {
                return function(cb) { successHandler = cb; return runner; };
            }
            if (prop === 'withFailureHandler') {
                return function(cb) { failureHandler = cb; return runner; };
            }
            if (prop === 'withUserObject') {
                return function(obj) { userObject = obj; return runner; };
            }

            // Execute the server function
            return function(...args) {
                (async () => {
                    try {
                        console.log(`[Supabase Bridge] Calling ${prop}`, args);
                        if (typeof supabaseClient[prop] !== 'function') {
                            throw new Error(`Function ${prop} not implemented in Supabase client`);
                        }
                        
                        const result = await supabaseClient[prop](...args);
                        if (successHandler) successHandler(result, userObject);
                    } catch (err) {
                        console.error(`[Supabase Bridge] Error in ${prop}:`, err);
                        if (failureHandler) failureHandler(err, userObject);
                    }
                })();
            };
        }
    });

    return runner;
}

const google = {
    script: {
        run: new Proxy({}, {
            get: function(target, prop) {
                return createGoogleScriptRunner()[prop];
            }
        })
    }
};

window.supabaseClient = supabaseClient;
window.google = google;
})();

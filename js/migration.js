$(document).ready(function() {
    // Initialize Supabase Client for Migration
    const supabaseDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const $logArea = $('#logArea');
    const $btnStart = $('#btnStartMigration');

    function logMessage(msg, type = 'info') {
        const time = new Date().toLocaleTimeString('th-TH');
        const colorClass = `log-${type}`;
        const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
        $logArea.append(`<div class="${colorClass}">[${time}] ${icon} ${msg}</div>`);
        $logArea.scrollTop($logArea[0].scrollHeight);
    }

    const MIGRATION_CONFIG = [
        {
            sheetName: 'Users',
            tableName: 'users',
            mapFunction: (row) => ({
                username: row.Username || row.username || row['ชื่อผู้ใช้'] || null,
                password: String(row.Password || row.password || row['รหัสผ่าน'] || ''),
                name: row.Name || row.name || row['ชื่อ-สกุล'] || null,
                role: (row.Role || row.role || row['สิทธิ์'] || 'viewer').toLowerCase()
            })
        },
        {
            sheetName: 'setting',
            tableName: 'settings',
            mapFunction: (row) => ({
                key: row.Key || row.key || null,
                value: String(row.Value || row.value || ''),
                description: row.Description || row.description || null
            })
        },
        {
            sheetName: 'CaseClose',
            tableName: 'case_close_rules',
            mapFunction: (row) => ({
                diax: row.Diax || row.diax || null,
                surgery: row['การผ่าตัด'] || row.Surgery || row.surgery || null
            })
        },
        {
            sheetName: 'PatientData',
            tableName: 'patients',
            mapFunction: (row) => {
                const mapped = {};
                for (let k in row) {
                    if (k.trim() !== '' && k !== 'ID') { // Skip ID to let Supabase auto-increment
                        let val = row[k];
                        if (val === '' || val === undefined || val === null) {
                            val = null;
                        } else if (typeof val === 'string' && val.trim() === '') {
                            val = null;
                        } else {
                            // Convert string booleans if necessary
                            if (val === 'TRUE' || val === 'true') val = true;
                            if (val === 'FALSE' || val === 'false') val = false;
                        }
                        mapped[k] = val;
                    }
                }
                return mapped;
            }
        }
    ];

    async function fetchCSVFromGoogleSheets(sheetId, sheetName) {
        return new Promise((resolve, reject) => {
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
            Papa.parse(url, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.errors && results.errors.length > 0) {
                        // Check for common CORS / permission errors
                        if (results.errors[0].type === 'NetworkError' || results.errors[0].message.includes('404')) {
                            reject(new Error(`ดึงข้อมูลไม่สำเร็จ อาจจะไม่ได้ตั้งค่า Share เป็น "Anyone with the link" หรือใส่ Sheet ID ผิด`));
                        } else {
                            reject(new Error(results.errors[0].message));
                        }
                    } else {
                        // Sometimes Google returns an HTML error page if not shared, which parses as weird headers
                        if (results.data.length > 0 && Object.keys(results.data[0])[0].toLowerCase().includes('<!doctype html>')) {
                            reject(new Error('ไม่ได้ตั้งค่าแผ่นงานเป็นสาธารณะ (Anyone with the link can view)'));
                        } else {
                            resolve(results.data);
                        }
                    }
                },
                error: function(err) {
                    reject(new Error(err.message || "Network Error"));
                }
            });
        });
    }

    async function processMigration() {
        const sheetId = $('#sheetId').val().trim();
        if (!sheetId) {
            Swal.fire('ข้อผิดพลาด', 'กรุณากรอก Google Sheet ID', 'error');
            return;
        }

        const isClearData = $('#clearDataFirst').is(':checked');
        const selectedSheets = [];
        $('.sheet-checkbox:checked').each(function() {
            selectedSheets.push($(this).val());
        });

        if (selectedSheets.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกตารางที่ต้องการดึงอย่างน้อย 1 ตาราง', 'warning');
            return;
        }

        $btnStart.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span> กำลังดำเนินการ...');
        $logArea.empty();
        logMessage(`เริ่มต้นกระบวนการโอนย้ายข้อมูลจาก Sheet ID: ${sheetId}`, 'info');

        try {
            for (const config of MIGRATION_CONFIG) {
                if (!selectedSheets.includes(config.sheetName)) continue;

                logMessage(`กำลังอ่านข้อมูลจากชีต: ${config.sheetName}...`, 'info');
                
                let rawData;
                try {
                    rawData = await fetchCSVFromGoogleSheets(sheetId, config.sheetName);
                } catch (e) {
                    logMessage(`เกิดข้อผิดพลาดในการอ่านชีต ${config.sheetName}: ${e.message}`, 'error');
                    continue; // Skip to next sheet
                }

                if (!rawData || rawData.length === 0) {
                    logMessage(`ไม่พบข้อมูลในชีต ${config.sheetName} ข้ามการทำงาน`, 'warn');
                    continue;
                }

                logMessage(`อ่านข้อมูลสำเร็จ ${rawData.length} รายการ กำลังเตรียมข้อมูล...`, 'success');

                const mappedData = rawData.map(row => config.mapFunction(row)).filter(row => {
                    // Basic sanity check: reject completely empty mapped objects
                    return Object.values(row).some(v => v !== null && v !== '');
                });

                if (isClearData) {
                    logMessage(`กำลังลบข้อมูลเดิมในตาราง ${config.tableName}...`, 'warn');
                    // Warning: Delete without eq() acts as Truncate if RLS allows or if using service role.
                    // With anon key + RLS 'Allow anonymous delete patients USING (true)', this deletes all rows.
                    const { error: delErr } = await supabaseDb.from(config.tableName).delete().neq('id', -999); 
                    // Hack to delete all: neq some impossible value. For patients, neq ID.
                    if (delErr) {
                         const { error: delErr2 } = await supabaseDb.from(config.tableName).delete().neq(config.tableName === 'patients' ? 'ID' : 'id', -999);
                         if(delErr2) logMessage(`คำเตือน: ไม่สามารถลบข้อมูลเก่าได้ (${delErr2.message})`, 'warn');
                    }
                }

                logMessage(`กำลังบันทึกข้อมูล ${mappedData.length} รายการลงตาราง ${config.tableName}...`, 'info');
                
                // Chunk inserting (Supabase has limits on payload size)
                const chunkSize = 100;
                let successCount = 0;
                let errorCount = 0;

                for (let i = 0; i < mappedData.length; i += chunkSize) {
                    const chunk = mappedData.slice(i, i + chunkSize);
                    
                    const { data, error } = await supabaseDb
                        .from(config.tableName)
                        .insert(chunk);

                    if (error) {
                        logMessage(`พบข้อผิดพลาดบันทึกชุดที่ ${Math.floor(i/chunkSize)+1}: ${error.message}`, 'error');
                        errorCount += chunk.length;
                    } else {
                        successCount += chunk.length;
                        logMessage(`✓ บันทึกสำเร็จแล้ว ${successCount}/${mappedData.length} รายการ`, 'success');
                    }
                }
                
                logMessage(`สรุปตาราง ${config.tableName}: สำเร็จ ${successCount}, ล้มเหลว ${errorCount}`, successCount > 0 ? 'success' : 'warn');
                logMessage('----------------------------------------', 'info');
            }

            Swal.fire('เสร็จสิ้น', 'การโอนย้ายข้อมูลเสร็จสมบูรณ์แล้ว โปรดตรวจสอบหน้าแสดงผลการทำงาน (Logs) สำหรับรายละเอียด', 'success');

        } catch (error) {
            logMessage(`เกิดข้อผิดพลาดร้ายแรง: ${error.message}`, 'error');
            Swal.fire('ผิดพลาด', error.message, 'error');
        } finally {
            $btnStart.prop('disabled', false).html('<i class="fas fa-cloud-download-alt"></i> เริ่มดึงข้อมูลและโอนย้าย');
            logMessage('กระบวนการเสร็จสมบูรณ์', 'info');
        }
    }

    $btnStart.on('click', processMigration);
});

# FTMO Risk & Objective Tracker

Local Web Application สำหรับ **Tony Funded Trader Project** ติดตามบัญชี FTMO **2-Step** ด้วยกฎและข้อมูลที่ผู้ใช้กรอก ไม่มี Buy/Sell Signal หรือการทำนายตลาด ไม่มี Backend, CDN, Analytics หรือ Runtime Package Dependency

## เปิดใช้งานบน Windows

1. ดาวน์โหลด/Clone repository นี้ แล้วเก็บไฟล์ทั้งหมดไว้ในโฟลเดอร์เดียวกัน
2. คลิกขวา ZIP → **Extract All / แยกไฟล์ทั้งหมด** ก่อน อย่าเปิด HTML จากใน ZIP โดยตรง
3. ดับเบิลคลิก **`FTMO-Tracker.html`** เพื่อเปิดด้วย Edge / Chrome รุ่นปัจจุบัน ไฟล์นี้รวม CSS และ JavaScript แล้ว จึงย้ายไปโฟลเดอร์อื่นได้โดยไม่ต้องย้ายไฟล์ประกอบ

4. เปิด **Account & Rules** เพื่อตั้งชื่อบัญชี ทุนเริ่มต้น Phase วันเริ่ม และ Timezone
5. เปิด **บันทึกรายวัน** เพื่อกรอกข้อมูลจริง แล้วดู Dashboard / Next Trade Planner

สำหรับนักพัฒนา เปิด `index.html` ได้เช่นกัน แต่ต้องมี `styles.css`, `calculations.js`, `storage.js` และ `app.js` อยู่ด้วยในโฟลเดอร์เดียวกัน หากเห็นหน้าเป็นข้อความ/ลิงก์ธรรมดาและไม่มี Dashboard แปลว่าไฟล์ประกอบยังไม่ถูกโหลด

หาก Browser หรือนโยบายองค์กรไม่อนุญาต `file://` / localStorage ให้ใช้ Local Server (ต้องมี Python 3):

```powershell
cd path\to\ftmo-risk-objective-tracker
py -m http.server 8000 --bind 127.0.0.1
```

จากนั้นพิมพ์ `http://127.0.0.1:8000` ใน Browser หยุด Server ด้วย Ctrl+C บน Linux/macOS ใช้ `python3` แทน `py` ไม่มีการประมวลผลฝั่ง Server; Server นี้เพียงส่งไฟล์ HTML/CSS/JS

ข้อมูลของ `file://` กับ Local Server เป็นคนละ Storage; ต้อง Export JSON แล้ว Import เมื่อต้องการย้ายวิธีเปิด ย้าย Browser ย้ายเครื่อง หรือเปลี่ยน Port ไม่ควรใช้ Incognito เพราะข้อมูลอาจหายเมื่อปิด Browser

## Account & Rules

Default: FTMO Free Trial Round 1 / USD 100,000 / Free Trial / Asia/Bangkok

| Phase        | Profit Target | Minimum Days | Daily Loss | Maximum Loss |
| ------------ | ------------: | -----------: | ---------: | -----------: |
| Free Trial   |            5% |            2 |         5% |          10% |
| Challenge    |           10% |            4 |         5% |          10% |
| Verification |            5% |            4 |         5% |          10% |
| FTMO Account |           N/A |          N/A |         5% |          10% |

ค่า Default และ Rules Last Verified Date `2026-10-09` มาจาก Specification ของโปรเจกต์ ไม่ใช่การยืนยันว่าผู้พัฒนาได้ตรวจ Rule ล่าสุดจาก FTMO แล้ว ตรวจ **Official Sources** และปรับ Rule ก่อนใช้กับบัญชีจริง ลิงก์ภายนอกไม่จำเป็นสำหรับการคำนวณและยังไม่ได้ตรวจการเข้าถึงจาก Cloud นี้เนื่องจาก Network Policy ปฏิเสธ FTMO

การเปลี่ยนชื่อ / Timezone / Rule ทำได้ในหน้า Settings แต่เปลี่ยนทุน Phase และ Start Date ของบัญชีที่มีประวัติต้อง Backup แล้ว Reset ก่อน เพื่อไม่ให้ประวัติหลายรอบปนกัน กฎที่แก้จะใช้คำนวณประวัติใหม่ด้วย แต่ Violation ที่เคยตรวจพบไม่ถูกล้าง

## บันทึกรายวัน

- **Date เป็นวัน FTMO ตาม Europe/Prague (CE(S)T)** ไม่ใช่วันไทยเสมอไป
- **Midnight Balance**: ยอด Balance จริง ณ 00:00 CE(S)T ต้องตรวจเอง ค่าที่เติมอัตโนมัติเป็นค่าเสนอจาก Balance ล่าสุด ไม่ใช่การดึง MT5
- **Balance**: ยอดสุทธิจาก Closed Trades รวมต้นทุนที่ลง Balance แล้ว
- **Manual Equity**: กรอก Equity จริงจาก MT5
- **Calculate Equity**: `Balance + Floating P/L + Swap − Commission` ใช้เฉพาะต้นทุน Open Positions ที่ยังไม่รวมใน Balance/Floating หากรวมไปแล้วให้กรอก 0 เพื่อไม่ Double Count
- **Lowest Equity Today**: ใส่ค่าต่ำสุดระหว่างวัน ไม่ใช่เพียง Closing Equity หากไม่ทราบให้เว้นว่าง จะขึ้น UNCONFIRMED และคำเตือน
- **Highest Equity Today**: ใส่ Peak ที่สังเกตจริง หากไม่กรอกจะเก็บ Peak จาก Equity ที่บันทึกเท่านั้น
- **Realised P/L**: Net closed P/L วันนี้ ใช้ในกราฟและ Daily Summary ไม่บวก Balance ให้อีกครั้ง
- **Risk Used**: ผลรวม Risk ตอนเปิด Trade วันนี้ แยกจาก P/L ช่อง $ / % ผูกกัน โดย % ใช้ Initial Capital เป็นฐาน
- Trades / Wins / Losses / Consecutive Losses ต้องไม่ติดลบ และ Wins + Losses ต้องไม่เกิน Trades
- ติ๊ก **Opened New Position Today** เพื่อเพิ่ม Trading Day เมื่อไม่ได้ใช้ Trade Log; การถือ Position ต่อเนื่องไม่ใช่วันเปิดใหม่
- ระบุ All Positions Closed / Notes / Psychology / Manual Rule Flags ตามข้อมูลจริง

1 รายการต่อวัน แก้ได้ใน Daily History โดย Lowest/Peak และ Violation ที่เคยพบจะถูกเก็บต่อเนื่อง ไม่รับวันที่อนาคต Dashboard จะ STOP Planner เมื่อไม่มีข้อมูลของวัน CE(S)T ปัจจุบัน เพราะ Midnight Floor เปลี่ยนหลัง Reset

แอปไม่เชื่อมต่อ MT5 และไม่ Monitor Intraday เอง **SAFE / PASS คือผลจากข้อมูลที่บันทึก ไม่ใช่การรับรองจาก FTMO** แม้ใส่ Lowest แล้ว หากข้อมูลไม่ครบจริง โปรแกรมไม่สามารถตรวจสิ่งที่ไม่ได้กรอกได้

## Trade Log และ Trading Days

Open / Close Date-Time กรอกตาม Account Local Timezone แล้วแปลงเก็บเป็น UTC นับ Unique Opening Date ตาม Europe/Prague อัตโนมัติ ไม่ใช่จำนวน Trades Close Time ว่างหมายถึง Position ยังเปิดอยู่ Trade Log ที่ยังเปิดจะขัดขวางการยืนยัน PASS แม้ติ๊ก All Positions Closed ใน Daily Entry

Gross P/L + Swap − Commission = Net P/L และ Net R = Net P/L / Risk (Risk 0 = N/A) Buy/Sell เป็นเพียงข้อมูล Trade ที่เกิดขึ้นแล้ว `No Trade` ไม่เพิ่ม Trading Days

Trade Log **ไม่แก้ Balance/Equity อัตโนมัติ** ต้องยืนยันยอดจริงใน Daily Entry เพื่อป้องกัน Double Count จำนวน Trades และ Risk รายวันใช้ค่าที่มากกว่าระหว่าง Daily Entry กับ Trade Log แทนการรวมซ้ำ

Consecutive Losses ใช้ลำดับ Close Time และเก็บจำนวนสูงสุดในวันนั้นเพื่อ STOP หลังแพ้ติดกัน 2 ครั้ง แม้ภายหลังกลับมาชนะ ถ้าไม่มี Log ละเอียดให้กรอกจำนวนแพ้ติดกันเอง การเพิ่ม Lot หลัง Trade ขาดทุนในวันเดียวกันถูกตรวจอัตโนมัติ Martingale / Averaging / Revenge ที่ข้อมูลไม่พอต้อง Flag เอง

## สูตรและเกณฑ์สำคัญ

ทุกสูตรหลักแยกอยู่ใน `calculations.js` และอธิบายภาษาไทยในหน้า **FTMO Rules Explained**

```text
Daily Allowance = Initial × Daily Loss %
Daily Floor = Midnight Balance − Daily Allowance
Daily Buffer = Current Equity − Daily Floor
Daily Usage % = MAX(0, Midnight Balance − Equity) / Daily Allowance × 100

Maximum Floor = Initial × (1 − Maximum Loss %)
Maximum Buffer = Equity − Maximum Floor
Maximum Usage % = MAX(0, Initial − Equity) / Maximum Loss Amount × 100

Current Drawdown % = MAX(0, Initial − Equity) / Initial × 100
Peak Drawdown % = MAX(0, Peak Equity − Equity) / Peak Equity × 100

Profit = Current Balance − Initial
Target Progress % = Profit / Target Amount × 100
```

ตรวจ Violation ด้วย Equity ต่ำกว่า Floor โดยตรง เท่ากับ Floor ยังไม่ถือว่าละเมิด แต่ Planner จะหยุดเมื่อแตะ Floor เพราะไม่มี Buffer คงเหลือ Intraday Violation ที่พบแล้วจะคงอยู่แม้ Equity ฟื้น ลบ/แก้ Entry หรือเปลี่ยน Rule ต้อง Reset รอบใหม่เพื่อล้างประวัติ เช่นเดียวกับ Lowest/Peak ที่เคยสังเกต

Profit Target ต้องใช้ Balance, Trading Days ครบ, Positions ปิดทั้งหมด, ข้อมูล Lowest ครบในวันที่บันทึก และไม่มี Violation จึงแสดง PASS

Daily Reset คำนวณจาก `Europe/Prague` ด้วย `Intl.DateTimeFormat`: กรุงเทพฯ จะเป็น 06:00 ช่วง CET และ 05:00 ช่วง CEST ไม่ Hardcode เวลาไทย

## Tony Risk และ Planner

Default A/A+ สูงสุด 0.25% ($250 เมื่อทุนเริ่มต้น $100K), 2 Trades/วัน, แพ้ติดกัน 2 ครั้ง STOP, Daily Loss ≥ 1% STOP B/No Trade = Risk 0 หากเปิด Allow A+ 0.50% ต้องปรับ Maximum Risk Per Trade ให้รองรับด้วย

ใช้ Drawdown ที่เข้มกว่าระหว่าง Initial / Peak: ถึง 2% ลด Risk, ถึง 3% พักอย่างน้อยหนึ่งวันทำการและ Review 10 trades, ถึง 4% STOP Simulation/Strategy และ Full Review เกณฑ์ปรับได้ใน Settings

หลัง 3% วันพักต้องเป็น Daily Entry ของวันถัดมา **จันทร์–ศุกร์** ไม่มี Trade และติ๊ก Review แล้ว; โปรแกรมไม่ทราบปฏิทินวันหยุดตลาด ผู้ใช้ต้องยืนยันว่าเป็น trading day ที่ตลาดเปิดจริง Full Review ที่ 4% คง STOP จน Reset รอบใหม่ ส่วน Daily STOP คงอยู่ตลอดวันและเริ่มประเมินวันใหม่หลังบันทึก Entry หลัง Reset

Planner ต้องกรอก Stop Distance (Price Units), Tick Size, Tick Value USD ต่อ 1 lot และ Lot Step จาก MT5 Contract Specification ไม่ Assume XAUUSD:

```text
Risk $ = Initial × Risk % / 100
Lots = Risk $ / (Stop Distance / Tick Size × Tick Value)
Projected Equity = Current Equity − Risk $ − Cost Reserve
```

Lot ปัดลงตาม Step; Buffer ใช้ Risk เต็มที่เสนอ เผื่อ Extra Cost/Slippage ได้ ถ้า Tick Value ไม่ใช่ USD ต้องแปลงให้ตรง Account Currency ก่อน หากค่า Balance/Equity จำลองต่างจาก Daily Entry จะไม่ยืนยันว่าพร้อมเทรด หาก SL ชน Tony Stop จะแสดง **DO NOT TRADE** แม้ไม่ชน FTMO Rule เป็นการจำลอง ไม่รับประกันราคา Fill

## Backup / Restore / Export / Reset

- **Backup / Export JSON**: ดาวน์โหลด Account, Rules, Daily, Trades, ประวัติ Violation และสถานะ Risk ทั้งหมด ควร Backup หลังบันทึกแต่ละวัน
- **Import JSON** ใน Settings: ตรวจ schema/ตัวเลข/วันที่/กฎก่อนแทนข้อมูล มีการยืนยันก่อน Restore ไม่ Merge หลายบัญชี ถ้าไฟล์ไม่ถูกต้องข้อมูลเดิมยังอยู่
- **CSV**: Export Daily และ Trades แยกกัน มี UTF-8 BOM สำหรับ Excel ภาษาไทย พร้อม Quote/ป้องกัน Spreadsheet Formula Injection
- **Reset Account**: Backup ก่อน จากนั้นล้างประวัติและ Violation ทั้งหมด คง Settings/Rules และตั้ง Start Date ใหม่ ปรับชื่อรอบ ทุน Phase ได้หลัง Reset
- หาก localStorage อ่านไม่ได้หรือเต็ม จะขึ้นข้อความผิดพลาด ไม่รายงานว่าบันทึกสำเร็จ ใช้ Backup ข้อมูลเดิมก่อนแก้ไข ไม่ควรล้าง Browser Data ก่อน Backup

ข้อมูลผูกกับ Browser Profile / Origin นี้ ไม่มี Cloud Sync, Login หรือบัญชีหลายรอบพร้อมกัน ใช้ JSON Backup แยกแต่ละรอบ มีการ Refresh เมื่อข้อมูลเปลี่ยนจากอีกแท็บ แต่ควรแก้ไขทีละแท็บ

## Weekly Review / กราฟ

เลือกช่วงวันที่ CE(S)T แสดง Closed Trades, Wins/Losses/Win Rate, Net $/%, Net R, Average R, Average Risk (Trades เปิดในช่วง), Intraday Peak DD ที่สังเกต, Lowest Equity, Best Setup และผล A+/A, Violations, No-Trade Days ที่บันทึก, Unique Trading Days และ Target Progress ณ วันสิ้นสุด Daily P/L แยกจาก Trade Log ไม่รวมซ้ำ

กราฟ SVG ไม่ต้องมี Dependency: Equity/Balance พร้อม Static Max Floor และ Daily Floor, Initial/Peak Drawdown, Profit Target Progress, Daily Realised P/L, Risk % per Trade และ Daily Risk

## ตรวจสูตร / Run Tests

เมื่อแก้ HTML/CSS/JavaScript ให้สร้างรุ่นไฟล์เดียวใหม่ด้วย `node build-standalone.cjs` ไม่แก้ `FTMO-Tracker.html` โดยตรง การสลับเปิด `index.html` กับ `FTMO-Tracker.html` ผ่าน `file://` อาจใช้พื้นที่เก็บข้อมูลต่างกันตาม Browser ให้ Backup JSON ก่อนย้าย

ใช้ Node.js 20+ (ไม่ต้องติดตั้ง Package):

```powershell
node --test tests.js
```

ครอบคลุมตัวอย่าง $100K, 6 edge cases, Equity/Costs, Intraday recovery, Latched violation, Profit/Days/Open positions, DST/Timezone, Tony stop/drawdown/cooldown, Position sizing, Weekly calculations, JSON validation และ CSV escaping

Demo ใน Dashboard จะ **แทนที่ข้อมูลบัญชี** ต้อง Backup ก่อน ผลที่ต้องได้:

```text
Initial 100,000 / Midnight Balance 101,000
Balance 100,700 / Floating -400 / Equity 100,300
Daily Floor 96,000 / Daily Buffer 4,300
Maximum Floor 90,000 / Maximum Buffer 10,300
```

Browser Integration Tests เป็นทางเลือก ต้องมี Playwright เท่านั้น (ไม่มีผลต่อการใช้งานแอป):

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests.browser.cjs
```

หรือใช้ Chrome/Chromium ที่ติดตั้งอยู่โดยตั้ง `CHROMIUM_PATH` เป็น path ของ executable Tests เปิด Local HTTP ชั่วคราว ใช้ Browser Profile แยก และทดสอบทุกหน้า, Demo, Persistence, Sticky violation, Planner, Trade CRUD, XSS escaping, JSON Backup/Restore, Theme, Tablet/Mobile แล้วปิด Server/Browser เอง ไฟล์ชั่วคราวถูกล้างเมื่อจบ

ใน Cloud นี้ทดสอบ Browser ผ่าน Local HTTP เพราะ Browser Policy บล็อก `file://`; จึงยังไม่ได้ทดสอบการดับเบิลคลิกไฟล์บน Windows จริง แอปใช้ Classic Scripts / ไม่มี Fetch หรือ ES Modules เพื่อรองรับการเปิดไฟล์ตรง

## โครงสร้างไฟล์

| ไฟล์                   | หน้าที่                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `FTMO-Tracker.html`    | รุ่นไฟล์เดียวสำหรับเปิดบน Windows (Generated)                |
| `build-standalone.cjs` | สร้างรุ่นไฟล์เดียวจาก Source Modules                         |
| `index.html`           | Shell / navigation / โหลด Classic Scripts                    |
| `styles.css`           | Responsive Desktop/Tablet/Mobile + Dark/Light                |
| `app.js`               | UI, Forms, Charts, Backup/Restore และจัดการการบันทึก         |
| `calculations.js`      | Pure Calculation / FTMO & Tony Rule Engine / Prague Timezone |
| `storage.js`           | localStorage, JSON Validation, CSV และ Downloads             |
| `tests.js`             | Automated Calculation/Storage Tests ด้วย Node Test Runner    |
| `tests.browser.cjs`    | Optional Browser Integration Tests                           |
| `README.md`            | วิธีใช้ / นิยาม / ข้อจำกัด / วิธีทดสอบ                       |

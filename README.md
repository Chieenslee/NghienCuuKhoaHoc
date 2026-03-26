<div align="center">
  <img src="assets/logo_2.png" alt="Đại Nam University" height="80">
  <br/>
  <h1>🌍 Ứng dụng đường đi Euler</h1>
  <p><strong>Mô phỏng và trực quan hóa lộ trình tối ưu cho xe quét đường (NCKH)</strong></p>
</div>

<hr/>

## 📖 Giới thiệu (Overview)
Dự án nhằm trực quan hóa, giải quyết và trình diễn cách áp dụng các thuật toán cốt lõi của **Lý thuyết Đồ thị** (Graph Theory) — cụ thể là định lý đường đi Euler (Euler Path/Circuit) và Bài toán người đưa thư Trung Hoa (Chinese Postman Problem - CPP) — vào bài toán thực tế: **Tối ưu hóa đường đi của mạng lưới xe công trình đô thị (như xe quét rác, tưới cây, thu gom rác)**.

Hệ thống cho phép người dùng tự do xây dựng các nút mạng lưới giao thông (đỉnh, đồ thị), tính toán đường đi, bù cạnh cho các giao lộ bậc lẻ, và chạy mô phỏng hoạt ảnh quá trình quét các tuyến phố. Hỗ trợ hiển thị trên cả bản đồ hệ trục tọa độ trừu tượng (Abstract Vector Map) lẫn bản đồ GPS đường phố thực thế (OSRM/LeafletJS).

## 🚀 Tính năng nổi bật (Features)
- 📊 **Xây dựng Mạng lưới Giao thông (Graph Builder):** Kéo thả (Drag & Pan), thêm bớt nút (`N`), nối đường (`Shift + Click`) hoặc sử dụng cú pháp nhanh (Vd: `1-2`, `A-B`).
- 🧮 **Tối ưu Lộ trình (Eulerization):** Tự động phát hiện các đoạn đường bậc lẻ và sử dụng BFS ghép cặp (Shortest Path) nhằm Euler hoá đồ thị (Tạo các cạnh ảo - deadheading). Dùng Hierholzer tính toán vòng lặp chu trình ngắn nhất phủ mọi đoạn đoạn đường ít nhất 1 lần.
- 🚛 **Mô phỏng (Simulation):** Chạy hoạt ảnh chiếc xe tự động thực thi chu trình Euler trên hệ thống. Tùy chỉnh vận tốc ($0.1x - 1.5x$), tạm dừng, tiếp tục.
- 🗺️ **Bản đồ thật GPS (Map Overlay):** Nhúng hệ thống đồ thị vào bản đồ địa lý thực thông qua LeafletJS và API tuyến đường OSRM.
- 📈 **Báo cáo phân tích KPI (Metrics Dashboard):** Tự tính toán số km lý thuyết của hạ tầng so với số km thực tế xe phải chạy (Deadheading distance ratio). Giao diện Glassmorphism trực quan.

## 💻 Công nghệ phát triển (Technologies Used)
- **Frontend Core:** HTML5, CSS3, ES6 JavaScript gốc (Vanilla JS - không dùng Framework để tối ưu hóa thuật toán và tốc độ DOM Rendering).
- **Cartography & Routing API:** Leaflet.js (Interactive Maps), OSRM API (Mã nguồn mở máy định tuyến đường).
- **UI/Visual:** SVG Element Manipulation (Giao diện đồ họa vector tương tác).

## ⚙️ Hướng dẫn cài đặt (Installation)

Vì ứng dụng hoàn toàn không sử dụng backend framework (Zero Dependencies), bạn không cần cài đặt Node.js hoặc package cồng kềnh.

1. **Sao chép mã nguồn (Clone Repo)**
```bash
git clone https://github.com/Chieenslee/NghienCuuKhoaHoc.git
cd NghienCuuKhoaHoc
```

2. **Khởi chạy trên trình duyệt**
- **Cách 1:** Mở trực tiếp file `index.html` lên các trình duyệt hiện đại (Chrome, Edge, Firefox).
- **Cách 2:** Chạy thông qua extension *Live Server* trong VScode.

*(Lưu ý: API Lấy bản đồ từ server OSRM gốc hoặc Geocoding đôi khi cần Internet để hiển thị Polyline uốn lượn thật trên chế độ "Bản đồ GPS").*

## ⌨️ Phím tắt Vận hành (Shortcuts)
Trong quá trình sử dụng hệ thống, bấm phím `?` ở góc thanh công cụ, hoặc dùng các phím cứng sau:
- <kbd>Space</kbd> : Bắt đầu / Tạm dừng mô phỏng.
- <kbd>Enter</kbd> : Tính toán Lộ trình (Chạy thuật toán).
- <kbd>R</kbd> : Hủy lịch / Reset hệ thống xe.
- <kbd>I</kbd> : Mở trang Báo cáo chi tiết hiệu suất.
- <kbd>F</kbd> : Fullscreen bản đồ làm việc.
- <kbd>E</kbd> : Hiển thị bảng giải thích các cung độ Euler lẻ.
- <kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd> : Zoom in / Zoom out / Zoom reset.

<br />

---
> 🎓 **Dự án Nghiên cứu Khoa học** - Đại học Đại Nam (Đại Nam University).

# BÁO CÁO NGHIÊN CỨU: ỨNG DỤNG ĐƯỜNG ĐI EULER TRONG BÀI TOÁN TỐI ƯU HÓA LỘ TRÌNH XE QUÉT ĐƯỜNG

## THÔNG TIN CHUNG

- **Tên dự án:** Ứng dụng đường đi Euler - Mô phỏng và trực quan hóa lộ trình tối ưu cho xe quét đường.
- **Mục tiêu:** Mô phỏng, trực quan hóa và giải quyết bài toán tối ưu lộ trình cho xe công trình đô thị (xe quét đường, xe gom rác) dựa trên lý thuyết đồ thị (Graph Theory).

---

## 1. TÓM TẮT (ABSTRACT)

Quản lý lộ trình cho các phương tiện dịch vụ công cộng đô thị như xe quét đường, xe thu gom rác là một thách thức lớn trong vận hành và tối ưu hóa chi phí. Bài nghiên cứu này đề xuất và trực quan hóa một giải pháp dựa trên lý thuyết đồ thị – cụ thể là **Bài toán người đưa thư Trung Hoa (Chinese Postman Problem - CPP)**, với nền tảng là thuật toán **đường đi Euler (Euler Path/Circuit)**. Hệ thống mô phỏng được xây dựng trên nền tảng web (HTML/CSS/JS thuần và LeafletJS) kết hợp API định tuyến thực tế (OSRM). Kết quả đạt được là một công cụ mạnh mẽ hỗ trợ việc mô phỏng, phân tích và đưa ra lộ trình quét đường tối ưu giúp giảm thiểu khoảng cách di chuyển lặp lại (deadheading), tiết kiệm nhiên liệu và thời gian.

---

## 2. GIỚI THIỆU (INTRODUCTION)

### 2.1. Đặt vấn đề

Các phương tiện như xe quét đường cần phải đi qua **mọi con đường (cạnh)** trong một khu vực nhất định ít nhất một lần. Nếu không có sự sắp xếp tối ưu, xe sẽ phải đi lại nhiều lần trên những đoạn đường đã làm nhiệm vụ, gây lãng phí nhiên liệu, tăng thời gian phát thải và hao mòn phương tiện.

### 2.2. Khung lý thuyết

- **Đồ thị vô hướng:** Mạng lưới giao thông được mô hình hóa thành một đồ thị $G = (V, E)$, trong đó $V$ là tập hợp các giao lộ (đỉnh) và $E$ là tập hợp các đoạn đường (cạnh).
- **Đường đi / Chu trình Euler:** Một chu trình đi qua tất cả các cạnh của đồ thị đúng một lần. Theo định lý Euler, một đồ thị liên thông có chu trình Euler khi và chỉ khi mọi đỉnh của nó đều có bậc chẵn.
- **Bài toán Người đưa thư Trung Hoa (CPP):** Nếu đồ thị có các đỉnh bậc lẻ, ta phải tìm cách "nhân đôi" một số cạnh sao cho toàn bộ đồ thị trở thành đồ thị Euler vơi tổng trọng số các cạnh nhân đôi là nhỏ nhất.

---

## 3. PHƯƠNG PHÁP LUẬN VÀ THUẬT TOÁN (METHODOLOGY)

Hệ thống giải quyết bài toán theo 3 giai đoạn cốt lõi:

### 3.1. Phân tích đồ thị và Tìm đỉnh bậc lẻ

Hệ thống khởi tạo danh sách kề (Adjacency List) từ dữ liệu người dùng nhập hoặc từ bản đồ. Duyệt qua tất cả các đỉnh và đếm bậc (số lượng cạnh nối với đỉnh). Các đỉnh có bậc lẻ được trích xuất thành một tập hợp riêng.

### 3.2. Euler hóa đồ thị (Eulerization)

Nhằm tạo ra một chu trình Euler hoàn chỉnh:

- Sử dụng thuật toán **BFS (Breadth-First Search) / Shortest Path** để tính toán khoảng cách ngắn nhất giữa các cặp đỉnh bậc lẻ.
- Ghép cặp các đỉnh bậc lẻ sao cho tổng chiều dài đoạn đường ghép là nhỏ nhất (Minimum Weight Perfect Matching).
- **Bù cạnh (Duplication):** Các đường đi ngắn nhất giữa các cặp đỉnh này được thêm vào đồ thị như các "cạnh ảo" (cạnh đi trùng, deadheading). Lúc này, mọi đỉnh đều trở thành bậc chẵn.

### 3.3. Thuật toán Hierholzer

Khi đồ thị đã đáp ứng định lý Euler, thuật toán Hierholzer được sử dụng để tìm kiếm chu trình Euler:

1. Chọn một đỉnh bắt đầu (vị trí trạm xuất phát của xe quét đường).
2. Di chuyển ngẫu nhiên (hoặc ưu tiên) qua các cạnh chưa được đi qua cho đến khi quay về đỉnh ban đầu tạo thành vòng (Sub-tour).
3. Đẩy các đường đã đi qua vào stack.
4. Lồng ghép các sub-tour lại với nhau để tạo ra **Chu trình Euler tối ưu cuối cùng**.
   *(Ghi chú: Trong hệ thống, thuật toán được cài đặt qua cơ chế con trỏ (index pointers) nhằm tối ưu bộ nhớ và bảo toàn danh sách kề cho quá trình mô phỏng).*

---

## 4. THIẾT KẾ VÀ KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

### 4.1. Nền tảng Công nghệ

- **Mức logic (Core):** Thuật toán tìm đường, quản lý State và mô hình hóa đồ thị viết bằng **Vanilla JavaScript (ES6)** nhằm đảm bảo hiệu năng xử lý tính toán đồ thị trong thời gian thực mà không phụ thuộc framework nặng.
- **Mức trực quan (UI/UX):** Giao diện "Glassmorphism" hiện đại, tối ưu HMI (Human-Machine Interface) lấy cảm hứng từ các dashboard hệ thống điều hành thông minh.
- **Bản đồ thật (Map Overlay):** Khai thác thư viện mở **Leaflet.js** và API định tuyến gốc hệ thống đường phố thực từ **OSRM (Open Source Routing Machine)**.

### 4.2. Các phân hệ chính

1. **Phân hệ Nhập liệu & Parser:** Phân tích dữ liệu JSON, cú pháp Cạnh (1-2), hay click trực tiếp trên màn hình ảo.
2. **Abstract Simulator (Mô phỏng trừu tượng):** Vẽ đồ thị node-to-node bằng SVG tinh khiết. Áp dụng ma trận biến đổi tự do kéo thả (Pan), phóng to (Zoom).
3. **GPS Routing Engine:** Bản xạ các đỉnh đồ thị giả lập vào các tọa độ Vĩ độ/Kinh độ thật, gọi API OSRM để vẽ Polyline (Routing) uốn lượn theo đường giao thông thực tế.
4. **Simulation Engine:** Chạy hoạt ảnh (Animation RequestFrames) điều khiển xe chạy theo % tiến độ, đồng thời tính toán các bộ chỉ số Real-time.

---

## 5. KẾT QUẢ VÀ TÍNH NĂNG ĐẠT ĐƯỢC (RESULTS & FEATURES)

### 5.1. Dashboard KPI & Metrics Report

Hệ thống cung cấp thước đo độ hiệu quả qua các chỉ số:

- **Km Thực tế (Real Distance):** Tổng độ dài hạ tầng mạng lưới đường bộ.
- **Km Thực chạy (Operational Distance):** Quãng đường xe bắt buộc phải di chuyển (bao gồm cả các đoạn trùng lặp/deadheading).
- **Hiệu suất Hành trình (Efficiency Route %):** Tỉ lệ đường phủ so với tổng đường di chuyển.
- **Chi phí Ước tính:** Dựa trên tốc độ định mức (km/h) và tiêu hao nhiên liệu định mức (Lít hoặc kWh cho xe).

### 5.2. Chức năng tương tác và Trải nghiệm người dùng

- **Global Shortcuts (Phím tắt):** Tối ưu hóa vận hành dành cho "Power Users" (như `Space` Play/Pause, `E` phân tích, `F` Fullscreen, `+/-` Zoom).
- **Chế độ màn hình giám sát (Fullscreen Simulation):** Ẩn các khối UI cấu hình để tập trung màn hình vào bản đồ, kèm theo hệ thống điều hướng nhúng chìm (PiP-like Menu).

---

## 6. ĐÁNH GIÁ VÀ HƯỚNG PHÁT TRIỂN TIẾP THEO (CONCLUSION & FUTURE WORK)

### 6.1. Đánh giá

Sản phẩm nghiên cứu đã hoàn thiện trọn vẹn việc "chuyển hóa lý thuyết đồ thị hàn lâm" thành một "Giải pháp phần mềm mô phỏng trực quan thiết thực". Sự giao thoa thành công giữa **Thuật toán cốt lõi** (Graph Theory - Euler) và **Công nghệ định vị trực tuyến** (OSRM Geo-routing) giúp hệ thống minh họa sống động cách các tuyến đường được làm sạch tối ưu. Đây là tài liệu vững chắc hỗ trợ cho những nhà hoạch định đô thị trong việc phân bổ nhân lực.

### 6.2. Hướng phát triển

1. **Multi-Vehicle Routing (VRP):** Thay vì một xe quét đường, hệ thống cần tối ưu cho đội xe (hạm đội xe - Fleet Management). Bài toán sẽ tiến hoá từ Định lý Thư Không thành **Capacitated Arc Routing Problem (CARP)**.
2. **Trọng số Thời gian thực (Traffic-Aware):** Đồng bộ dữ liệu ùn tắc giao thông, chất lượng không khí, và mật độ rác từ hệ thống API Smart City để áp trọng số động (Dynamic Weights) cho đường đi thay vì chỉ xét trên khoảng cách tĩnh.
3. **Bản đồ luồng xe (Directed Graph mapping):** Xử lý bổ sung mô hình cho các mạng lưới giao thông đường một chiều, biến đổi bài toán thành **Mixed CPP** hoặc **Directed CPP**.

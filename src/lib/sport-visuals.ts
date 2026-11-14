/** Ảnh dùng chung cho danh mục hiện có ở trang giới thiệu và lớp học.
 * Ghép theo tên để ID bộ môn khác nhau giữa các database vẫn chọn đúng ảnh.
 * Đây là thông tin trình bày; danh sách lớp và quyền đăng ký vẫn lấy từ backend.
 */
export const sportVisuals = [
  {
    title: "Yoga",
    image: "yoga",
    alt: "Học viên giữ tư thế thăng bằng nghiêng trong phòng tập.",
    detail: "Hơi thở & thăng bằng",
  },
  {
    title: "Fitness",
    image: "fitness",
    alt: "Học viên tập với tạ tay trước gương trong phòng tập.",
    detail: "Sức mạnh & sức bền",
  },
  {
    title: "Pilates",
    image: "pilates",
    alt: "Học viên kéo giãn trên máy Pilates Reformer.",
    detail: "Kiểm soát & linh hoạt",
  },
  {
    title: "Cầu lông",
    image: "badminton",
    alt: "Người chơi cầm vợt trên sân cầu lông trong nhà.",
    detail: "Phản xạ & di chuyển",
  },
  {
    title: "Bóng rổ",
    image: "basketball",
    alt: "Các cầu thủ tranh bóng trên sân bóng rổ trong nhà.",
    detail: "Phối hợp & bứt phá",
  },
  {
    title: "Bơi lội",
    image: "swimming",
    alt: "Học viên chuẩn bị xuống bể bơi trong nhà.",
    detail: "Kỹ thuật & sức bền",
  },
  {
    title: "Boxing",
    image: "boxing",
    alt: "Vận động viên đeo găng tập luyện trên sàn boxing.",
    detail: "Tốc độ & tập trung",
  },
] as const;

export function sportVisual(name: string | undefined) {
  return sportVisuals.find(
    (sport) =>
      sport.title.toLocaleLowerCase("vi") ===
      name?.trim().toLocaleLowerCase("vi"),
  );
}

export function sportImage(image: string) {
  return `/media/landing/${image}.webp`;
}

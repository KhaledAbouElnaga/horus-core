# Skill: student-registration (مثال Workflows البيزنس — تُوسّع بدون تعديل الـcore)
name: student-registration
description: استقبال ملفات طالب → استخراج → تحقق → منع تكرار → تحديث شيت → فولدر سحابي → تحقق → نص تواصل
trigger: "سجّل الطالب" أو ملفات جديدة في مجلد القبول
tools_required: [drive, sheets, files]
permissions: [read_files, write_sheets, create_folders]
human_gates: [duplicate_conflict, missing_required_doc]
steps:
  1_receive: استلام الملفات وحفظها مؤقتًا
  2_extract: استخراج البيانات المطلوبة
  3_validate: تحقق من الحقول + تطبيع القيم
  4_dedupe: فحص التكرار قبل الكتابة
  5_write: تحديث الشيت + إنشاء الفولدر + الرفع + حفظ الرابط
  6_verify: قراءة خارجية تؤكد كل كتابة (evidence-based)
  7_message: إنتاج نص التواصل + حذف المؤقت الحساس
expected_output: سجل طالب موثق + folder URL + رسالة جاهزة

import json
import os
import hashlib
from collections import defaultdict
from PIL import Image, ImageStat

def run_audit():
    base_web = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web'
    json_dir = os.path.join(base_web, 'src/data/exams')
    assets_dir = os.path.join(base_web, 'public/exam-assets/gate/2025')
    
    gate_files = sorted([f for f in os.listdir(json_dir) if f.startswith('gate-') and f.endswith('.json')])
    
    total_questions = 0
    questions_with_images = 0
    text_only_questions = 0
    
    total_option_images = 0
    suspicious_option_images = []
    suspicious_diagram_images = []
    
    hash_to_files = defaultdict(list)
    files_to_hash = {}
    
    tiny_images = []
    huge_images = []
    blank_images = []
    watermark_like_images = []
    
    all_referenced_assets = set()
    
    for jf in gate_files:
        with open(os.path.join(json_dir, jf)) as f:
            paper = json.load(f)
            
        code = paper.get('paperCode', jf)
        for q in paper.get('questions', []):
            total_questions += 1
            q_num = q.get('questionNumber')
            diag_url = q.get('diagramUrl')
            opt_imgs = q.get('optionImages') or []
            has_opt_img = any(opt_imgs)
            
            if diag_url:
                questions_with_images += 1
                all_referenced_assets.add(diag_url)
                # Check diagram
                p_rel = diag_url.replace('/exam-assets/gate/2025/', '')
                full_p = os.path.join(assets_dir, p_rel)
                if os.path.exists(full_p):
                    sz = os.path.getsize(full_p)
                    with open(full_p, 'rb') as fp:
                        h = hashlib.sha256(fp.read()).hexdigest()
                    hash_to_files[h].append(('DIAG', code, q_num, diag_url))
                    
                    try:
                        im = Image.open(full_p)
                        w, h_px = im.size
                        if w < 30 or h_px < 20 or sz < 600:
                            tiny_images.append((diag_url, w, h_px, sz))
                        if w > 2000 or h_px > 2000 or sz > 1024*1024:
                            huge_images.append((diag_url, w, h_px, sz))
                            
                        # Check if faint / watermark-like (mean color > 240 or standard deviation < 10)
                        stat = ImageStat.Stat(im)
                        mean_val = sum(stat.mean[:3]) / 3.0
                        if mean_val > 250:
                            blank_images.append((diag_url, mean_val))
                    except Exception:
                        pass
                        
            if not diag_url and not has_opt_img:
                text_only_questions += 1
                
            for oi, o_url in enumerate(opt_imgs):
                if o_url:
                    total_option_images += 1
                    all_referenced_assets.add(o_url)
                    opt_text = q.get('options', [])[oi] if oi < len(q.get('options', [])) else ''
                    
                    p_rel = o_url.replace('/exam-assets/gate/2025/', '')
                    full_p = os.path.join(assets_dir, p_rel)
                    if os.path.exists(full_p):
                        sz = os.path.getsize(full_p)
                        with open(full_p, 'rb') as fp:
                            h = hashlib.sha256(fp.read()).hexdigest()
                        hash_to_files[h].append(('OPT', code, q_num, oi, o_url, opt_text))
                        
                        try:
                            im = Image.open(full_p)
                            w, h_px = im.size
                            if w < 30 or h_px < 20 or sz < 600:
                                tiny_images.append((o_url, w, h_px, sz))
                            if w > 2000 or h_px > 2000 or sz > 1024*1024:
                                huge_images.append((o_url, w, h_px, sz))
                                
                            stat = ImageStat.Stat(im)
                            mean_val = sum(stat.mean[:3]) / 3.0
                            if mean_val > 250:
                                blank_images.append((o_url, mean_val))
                        except Exception:
                            pass
                            
                        # If the option text is normal readable text (> 0 chars), it is suspicious because GATE options with diagrams don't have text!
                        if opt_text and len(opt_text.strip()) > 0:
                            suspicious_option_images.append((code, q_num, oi, opt_text, o_url, sz))
                            
    # Also count files on disk in assets_dir
    disk_files = []
    disk_bytes = 0
    for root, dirs, files in os.walk(assets_dir):
        for f in files:
            if f.endswith('.png'):
                fp = os.path.join(root, f)
                disk_files.append(fp)
                disk_bytes += os.path.getsize(fp)
                
    duplicate_groups = {h: items for h, items in hash_to_files.items() if len(items) > 1}
    cross_paper_duplicates = {h: items for h, items in duplicate_groups.items() if len(set(x[1] for x in items)) > 1}
    
    print('====================================================')
    print('GATE 2025 COMPREHENSIVE VISUAL INGESTION AUDIT')
    print('====================================================')
    print(f'1. Total questions: {total_questions}')
    print(f'2. Questions with images (diagrams): {questions_with_images}')
    print(f'3. Text-only questions: {text_only_questions}')
    print(f'4. Questions with suspicious images: {len(suspicious_diagram_images)}')
    print(f'5. Total option images referenced: {total_option_images}')
    print(f'6. Suspicious option images (valid text + attached image): {len(suspicious_option_images)} ({len(suspicious_option_images)/max(1, total_option_images)*100:.1f}%)')
    print(f'7. Duplicate image hashes: {len(duplicate_groups)} groups ({sum(len(v) for v in duplicate_groups.values())} files)')
    print(f'8. Tiny images (<30px or <600B): {len(tiny_images)}')
    print(f'9. Huge images (>2000px or >1MB): {len(huge_images)}')
    print(f'10. Blank/faint images: {len(blank_images)}')
    print(f'11. Total PNG files on disk: {len(disk_files)} ({disk_bytes / (1024*1024):.2f} MB)')
    print(f'12. Images shared across multiple papers: {len(cross_paper_duplicates)} groups ({sum(len(v) for v in cross_paper_duplicates.values())} occurrences)')
    print('====================================================\n')
    
    print('--- Breakdown of Suspicious Option Images Examples ---')
    for item in suspicious_option_images[:10]:
        print(f'Paper: {item[0]}, Q{item[1]}, Option {chr(65+item[2])}: \"{item[3]}\" -> Image: {item[4]} ({item[5]} B)')
        
if __name__ == '__main__':
    run_audit()

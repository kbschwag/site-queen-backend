#!/usr/bin/env python3
"""
Extract design constraints from Figma-exported templates.
This script analyzes HTML and CSS to identify replaceable text nodes,
their character limits, font sizes, and container widths.
"""

import os
import re
import json
from pathlib import Path
from html.parser import HTMLParser
from typing import Dict, List, Any

class TextNodeExtractor(HTMLParser):
    """Extract text nodes and their CSS classes from HTML."""
    
    def __init__(self):
        super().__init__()
        self.text_nodes = []
        self.current_classes = []
        self.current_text = []
        self.in_script = False
        self.in_style = False
    
    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.in_script = True
        elif tag == 'style':
            self.in_style = True
        else:
            attrs_dict = dict(attrs)
            if 'class' in attrs_dict:
                self.current_classes = attrs_dict['class'].split()
            if tag in ['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button']:
                self.current_text = []
    
    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False
        elif tag == 'style':
            self.in_style = False
        elif tag in ['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button']:
            text = ''.join(self.current_text).strip()
            if text and len(text) > 2 and not self.in_script and not self.in_style:
                # Skip common structural text
                if text not in ['HOME', 'SERVICES', 'ABOUT', 'CONTACT', 'LEARN MORE', '→', '+', '×']:
                    self.text_nodes.append({
                        'text': text,
                        'classes': self.current_classes.copy(),
                        'tag': tag,
                        'char_count': len(text)
                    })
            self.current_text = []
            self.current_classes = []
    
    def handle_data(self, data):
        if not self.in_script and not self.in_style:
            self.current_text.append(data)

def extract_css_properties(css_content: str, class_name: str) -> Dict[str, str]:
    """Extract CSS properties for a given class."""
    # Simple regex-based CSS extraction (not perfect, but good enough)
    pattern = rf'\.{re.escape(class_name)}\s*{{([^}}]+)}}'
    match = re.search(pattern, css_content)
    if match:
        props_str = match.group(1)
        props = {}
        for prop in props_str.split(';'):
            if ':' in prop:
                key, value = prop.split(':', 1)
                props[key.strip()] = value.strip()
        return props
    return {}

def estimate_max_chars(font_size: str, container_width: str) -> int:
    """Estimate max characters based on font size and container width."""
    # Rough estimation: average char width is ~0.5 * font size
    try:
        size_px = int(re.search(r'\d+', font_size).group())
        width_px = int(re.search(r'\d+', container_width).group())
        avg_char_width = size_px * 0.5
        max_chars = int((width_px / avg_char_width) * 0.9)  # 90% to be safe
        return max(20, max_chars)  # Minimum 20 chars
    except:
        return 100  # Default fallback

def analyze_template(template_dir: str) -> Dict[str, Any]:
    """Analyze a single template directory."""
    template_name = os.path.basename(template_dir)
    print(f"\n{'='*60}")
    print(f"Analyzing: {template_name}")
    print(f"{'='*60}")
    
    html_file = os.path.join(template_dir, 'index.html')
    style_file = os.path.join(template_dir, 'style.css')
    styleguide_file = os.path.join(template_dir, 'styleguide.css')
    globals_file = os.path.join(template_dir, 'globals.css')
    
    if not os.path.exists(html_file):
        print(f"❌ No index.html found in {template_dir}")
        return {}
    
    # Read files
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    css_content = ""
    for css_file in [globals_file, styleguide_file, style_file]:
        if os.path.exists(css_file):
            with open(css_file, 'r', encoding='utf-8') as f:
                css_content += f.read() + "\n"
    
    # Extract text nodes
    parser = TextNodeExtractor()
    parser.feed(html_content)
    text_nodes = parser.text_nodes
    
    print(f"Found {len(text_nodes)} text nodes")
    
    # Identify key replaceable nodes (headlines, subheadings, body text)
    replaceable_nodes = []
    for i, node in enumerate(text_nodes):
        text = node['text']
        char_count = node['char_count']
        
        # Heuristics for replaceable content
        is_replaceable = (
            char_count > 5 and  # Not too short
            char_count < 500 and  # Not too long
            not any(skip in text for skip in ['©', '2026', 'Powered by', 'All Rights'])
        )
        
        if is_replaceable:
            # Estimate font size from classes
            font_size = "16px"  # Default
            for class_name in node['classes']:
                css_props = extract_css_properties(css_content, class_name)
                if 'font-size' in css_props:
                    font_size = css_props['font-size']
                    break
            
            replaceable_nodes.append({
                'id': f"text_node_{i}",
                'text': text[:100],  # Truncate for display
                'char_count': char_count,
                'classes': node['classes'],
                'tag': node['tag'],
                'font_size': font_size,
                'estimated_max_chars': estimate_max_chars(font_size, "1200px"),  # Assume 1200px container
                'replaceable': True,
                'constraint': f"{node['tag'].upper()} element with {char_count} chars"
            })
    
    # Sort by character count (longest first - likely headlines)
    replaceable_nodes.sort(key=lambda x: x['char_count'], reverse=True)
    
    print(f"Identified {len(replaceable_nodes)} replaceable nodes")
    
    return {
        'template_name': template_name,
        'template_dir': template_dir,
        'replaceable_nodes': replaceable_nodes[:20],  # Top 20 nodes
        'total_text_nodes': len(text_nodes),
        'total_replaceable': len(replaceable_nodes)
    }

def main():
    template_base = "/home/ubuntu/site-queen-backend/template-analysis"
    
    if not os.path.exists(template_base):
        print(f"❌ Template directory not found: {template_base}")
        return
    
    templates = [d for d in os.listdir(template_base) if os.path.isdir(os.path.join(template_base, d)) and 'template' in d.lower()]
    
    print(f"\n🔍 Found {len(templates)} templates to analyze")
    
    all_results = {}
    for template in sorted(templates):
        template_path = os.path.join(template_base, template)
        result = analyze_template(template_path)
        if result:
            all_results[template] = result
    
    # Save results
    output_file = "/home/ubuntu/site-queen-backend/template-constraints-analysis.json"
    with open(output_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    print(f"\n✅ Analysis complete! Results saved to {output_file}")
    
    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for template, data in all_results.items():
        print(f"\n{template}:")
        print(f"  Total text nodes: {data['total_text_nodes']}")
        print(f"  Replaceable nodes: {data['total_replaceable']}")
        if data['replaceable_nodes']:
            print(f"  Top replaceable node: {data['replaceable_nodes'][0]['text'][:50]}... ({data['replaceable_nodes'][0]['char_count']} chars)")

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Update the main JS file with Pokemon data and fix sprites dropdown."""

import json

def main():
    # Read the Pokemon data
    with open('dist/assets/pokemon-data.json', 'r') as f:
        pokemon_data = json.load(f)
    
    print(f"Loaded {len(pokemon_data)} Pokemon")
    
    # Read the main JS file
    with open('dist/assets/index-CgSQRD65.js', 'r') as f:
        js_content = f.read()
    
    # Find and replace the ue= array
    ue_start = js_content.find('ue=[{')
    if ue_start == -1:
        # Try finding with quote
        ue_start = js_content.find('ue=["')
    
    if ue_start == -1:
        print("Could not find ue=[{ pattern")
        return
    
    # Find the matching ] by counting brackets
    depth = 0
    in_string = False
    string_char = None
    end_idx = ue_start
    
    for i, c in enumerate(js_content[ue_start:], ue_start):
        if not in_string:
            if c in '"\`':
                in_string = True
                string_char = c
            elif c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    end_idx = i
                    break
        else:
            if c == string_char and (i == ue_start or js_content[i-1] != '\\'):
                in_string = False
    
    print(f"Found ue array from {ue_start} to {end_idx}")
    print(f"Old array length: {end_idx - ue_start + 1} chars")
    
    # Create new ue array string in minified format
    new_ue = 'ue=' + json.dumps(pokemon_data, separators=(',', ':'))
    
    # Replace the old ue array
    new_js_content = js_content[:ue_start] + new_ue + js_content[end_idx+1:]
    
    print(f"New array length: {len(new_ue)} chars")
    
    # Write the updated JS file
    with open('dist/assets/index-CgSQRD65.js', 'w') as f:
        f.write(new_js_content)
    
    print("Updated index-CgSQRD65.js")
    
    # Verify the update
    with open('dist/assets/index-CgSQRD65.js', 'r') as f:
        verify = f.read()
    
    # Check if pecharunt is now in the data
    if 'pecharunt' in verify:
        print("✓ pecharunt found in updated file")
    else:
        print("✗ pecharunt NOT found in updated file")

if __name__ == "__main__":
    main()

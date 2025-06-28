#!/bin/bash

# Check if zenity is installed
if ! command -v zenity &> /dev/null; then
    echo "Error: zenity is required but not installed. Please install it (e.g., sudo apt install zenity on Ubuntu)."
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Open a GUI folder selection dialog starting from the script's directory, allowing multiple folder selection
SELECTED_FOLDERS=$(zenity --file-selection --directory --multiple --separator="|" --title="Select folders to extract code from" --filename="$SCRIPT_DIR/")

# Check if the user canceled the selection
if [ -z "$SELECTED_FOLDERS" ]; then
    echo "No folders selected. Exiting."
    exit 1
fi

# Output file name with timestamp
OUTPUT_FILE="extracted_code_$(date +%Y%m%d_%H%M%S).txt"

# Convert the pipe-separated folders into an array
IFS="|" read -r -a FOLDERS <<< "$SELECTED_FOLDERS"

# Iterate over each selected folder and extract code
echo "Extracting code from selected folders..."
for FOLDER in "${FOLDERS[@]}"; do
    if [ -d "$FOLDER" ]; then
        echo "Processing folder: $FOLDER"
        # Recursively find all files in the current folder and extract their content
        find "$FOLDER" -type f | while read -r file; do
            # Print the file path as a header
            echo "===== File: $file =====" >> "$OUTPUT_FILE"
            # Append the file content
            cat "$file" >> "$OUTPUT_FILE"
            # Add a separator
            echo -e "\n\n" >> "$OUTPUT_FILE"
        done
    else
        echo "Warning: $FOLDER is not a valid directory, skipping..."
    fi
done

# Check if the output file was created successfully
if [ -f "$OUTPUT_FILE" ]; then
    echo "Code extracted successfully to $OUTPUT_FILE"
    # Open the output file in the default text editor (optional)
    xdg-open "$OUTPUT_FILE" &> /dev/null || echo "Please open $OUTPUT_FILE manually."
else
    echo "Error: Failed to create $OUTPUT_FILE"
    exit 1
fi
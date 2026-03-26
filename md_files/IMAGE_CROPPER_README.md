# Image Cropper Integration for MagicS

## Overview
This project now includes a powerful manual image cropping feature using the `com.github.CanHub:Android-Image-Cropper` library. The image cropper provides precise manual control over image cropping with various aspect ratios and shapes.

## Features

### 🎯 Manual Cropping Controls
- **Drag to adjust**: Drag the crop area corners to resize
- **Pinch to zoom**: Pinch gesture to zoom in/out
- **Pan to move**: Drag the crop area to reposition
- **Real-time preview**: See the cropped result in real-time

### 📐 Aspect Ratio Options
- **Free**: No aspect ratio constraints
- **1:1**: Square format (perfect for profile pictures)
- **4:3**: Standard photo format
- **16:9**: Widescreen format
- **3:2**: Classic photo format

### 🔄 Crop Shapes
- **Rectangle**: Standard rectangular cropping
- **Oval**: Circular/elliptical cropping

### 📱 Image Sources
- **Gallery**: Select from device photo gallery
- **Camera**: Take a new photo directly
- **Permission handling**: Automatic permission requests with user-friendly dialogs

## How to Use

### 1. Access the Image Cropper
- From the main menu, tap "Crop Image"
- Or navigate programmatically: `navController.navigate("imagecropper")`

### 2. Select an Image
- Tap "Select Image" button
- Choose between Gallery or Camera
- Grant necessary permissions when prompted

### 3. Configure Crop Settings
- Choose your preferred aspect ratio
- Select crop shape (Rectangle or Oval)
- Settings are applied when you tap "Crop Image"

### 4. Manual Cropping
- Drag the corner handles to resize the crop area
- Pinch to zoom in/out for precise control
- Drag the crop area to reposition
- Tap the checkmark to confirm your crop

### 5. Result
- The cropped image is automatically processed
- You can navigate to the processing screen with the cropped image
- The cropped image URI is passed to your callback function

## Technical Implementation

### Dependencies Added
```kotlin
// Image Cropping Library
implementation("com.github.CanHub:Android-Image-Cropper:4.6.0")

// Image Picker
implementation("com.github.dhaval2404:imagepicker:2.1")
```

### Key Components

#### ImageCropperScreen.kt
- Main composable for the image cropping interface
- Handles image selection, cropping options, and result processing
- Includes permission management and user guidance

#### ImageUtils.kt
- Utility functions for image processing
- File management and URI handling
- Bitmap operations and memory optimization

#### Navigation Integration
- Added "imagecropper" route to the navigation graph
- Integrated with existing menu system
- Seamless flow to processing screen

### Permissions Required
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
```

### File Provider Configuration
The app includes proper FileProvider configuration for secure file sharing between activities.

## Customization Options

### Crop Image Options
You can customize the cropping experience by modifying the `CropImageOptions`:

```kotlin
CropImageOptions(
    aspectRatioX = 1, // Width aspect ratio
    aspectRatioY = 1, // Height aspect ratio
    cropShape = CropImageView.CropShape.RECTANGLE,
    guidelines = CropImageView.Guidelines.ON,
    autoZoomEnabled = true,
    multiTouchEnabled = true,
    showCropOverlay = true,
    showProgressBar = true,
    borderLineThickness = 3f,
    borderLineColor = Color.WHITE,
    borderCornerThickness = 5f,
    borderCornerLength = 14f,
    borderCornerOffset = 5f,
    borderCornerColor = Color.WHITE,
    cropBackgroundColor = Color.TRANSPARENT,
    minCropWindowSize = 40,
    minCropResultSize = 40,
    maxCropWindowSize = 99999,
    maxCropResultSize = 99999,
    activityTitle = "Crop Image",
    activityMenuIconColor = Color.WHITE,
    outputCompressFormat = Bitmap.CompressFormat.JPEG,
    outputCompressQuality = 90
)
```

## Integration with Existing Workflow

The image cropper integrates seamlessly with your existing image processing workflow:

1. **Menu Screen**: Added "Crop Image" button
2. **Navigation**: Direct route to cropper screen
3. **Processing**: Cropped images flow to your processing screen
4. **File Management**: Proper cleanup and temporary file handling

## Best Practices

1. **Memory Management**: The cropper handles large images efficiently
2. **Permission Handling**: User-friendly permission requests with rationale
3. **Error Handling**: Graceful handling of image loading and cropping errors
4. **File Cleanup**: Automatic cleanup of temporary files
5. **User Experience**: Clear instructions and intuitive interface

## Troubleshooting

### Common Issues
1. **Permission Denied**: Ensure all required permissions are granted
2. **Image Not Loading**: Check file URI and permissions
3. **Crop Not Working**: Verify the cropping library is properly integrated
4. **Memory Issues**: Large images are automatically optimized

### Debug Tips
- Check the logcat for detailed error messages
- Verify file provider configuration
- Ensure proper URI handling
- Test with different image formats and sizes

## Future Enhancements

Potential improvements you could add:
- Batch cropping for multiple images
- Advanced filters and effects
- Custom crop shapes
- Cloud storage integration
- Image enhancement tools
- Batch processing capabilities

The image cropper is now fully integrated and ready to use! 🎉


#import <AppKit/AppKit.h>
#import <AVFoundation/AVFoundation.h>

static const NSInteger FrameWidth = 1280;
static const NSInteger FrameHeight = 720;
static const NSInteger FramesPerSecond = 30;
static const NSInteger TotalFrames = 150;

static NSColor *Color(CGFloat red, CGFloat green, CGFloat blue) {
  return [NSColor colorWithCalibratedRed:red / 255.0 green:green / 255.0 blue:blue / 255.0 alpha:1.0];
}

static void FillRounded(NSRect rect, CGFloat radius, NSColor *color) {
  NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:radius yRadius:radius];
  [color setFill];
  [path fill];
}

static void DrawText(NSString *text, CGFloat x, CGFloat y, CGFloat width, CGFloat height, CGFloat size, NSColor *color, BOOL bold) {
  NSFont *font = bold ? [NSFont systemFontOfSize:size weight:NSFontWeightSemibold] : [NSFont systemFontOfSize:size weight:NSFontWeightRegular];
  NSDictionary *attributes = @{
    NSFontAttributeName: font,
    NSForegroundColorAttributeName: color
  };
  [text drawInRect:NSMakeRect(x, y, width, height) withAttributes:attributes];
}

static void DrawFrame(CGContextRef context, NSInteger frameIndex) {
  NSGraphicsContext *graphicsContext = [NSGraphicsContext graphicsContextWithCGContext:context flipped:NO];
  [NSGraphicsContext saveGraphicsState];
  [NSGraphicsContext setCurrentContext:graphicsContext];

  [[NSColor colorWithCalibratedRed:248.0 / 255.0 green:245.0 / 255.0 blue:238.0 / 255.0 alpha:1.0] setFill];
  NSRectFill(NSMakeRect(0, 0, FrameWidth, FrameHeight));

  FillRounded(NSMakeRect(52, 46, 1176, 628), 20, [NSColor whiteColor]);
  DrawText(@"Citation Context Reconciler", 88, 604, 720, 44, 36, Color(38, 34, 29), YES);
  DrawText(@"SCIBASE issue #16 assistant slice: citation drift, contradictions, and reproducibility support.", 88, 570, 960, 28, 18, Color(100, 92, 82), NO);

  CGFloat progress = (CGFloat)frameIndex / (CGFloat)(TotalFrames - 1);
  FillRounded(NSMakeRect(88, 532, 1088, 12), 6, Color(224, 218, 207));
  FillRounded(NSMakeRect(88, 532, 1088 * progress, 12), 6, Color(43, 124, 132));

  NSArray<NSString *> *labels = @[@"Claims", @"Blockers", @"Warnings", @"Repro"];
  NSArray<NSString *> *values = @[@"3", @"5", @"6", @"50%"];
  NSArray<NSString *> *details = @[@"reviewed", @"must fix", @"review notes", @"medium"];
  for (NSInteger index = 0; index < 4; index++) {
    CGFloat x = 88 + index * 270;
    FillRounded(NSMakeRect(x, 372, 238, 130), 14, Color(241, 237, 228));
    DrawText(labels[index], x + 22, 458, 180, 24, 16, Color(100, 92, 82), YES);
    DrawText(values[index], x + 22, 416, 160, 40, 31, Color(38, 34, 29), YES);
    DrawText(details[index], x + 22, 394, 180, 22, 14, Color(116, 107, 96), NO);
  }

  FillRounded(NSMakeRect(88, 142, 1088, 184), 18, Color(23, 33, 43));
  DrawText(@"Reviewer queue", 124, 278, 260, 32, 23, [NSColor whiteColor], YES);
  DrawText(@"contradictory-cited-effects: claim-cytokine-recovery", 124, 238, 720, 26, 17, Color(231, 242, 245), NO);
  DrawText(@"citation-intent-mismatch: claim-scrna-pathway", 124, 204, 720, 26, 17, Color(231, 242, 245), NO);
  DrawText(@"reproducibility-evidence-gap: claim-pipeline-reproducible", 124, 170, 760, 26, 17, Color(231, 242, 245), NO);

  CGFloat pulse = 0.42 + 0.35 * sin(progress * M_PI * 4.0);
  NSColor *pulseColor = [NSColor colorWithCalibratedRed:43.0 / 255.0 green:124.0 / 255.0 blue:132.0 / 255.0 alpha:pulse];
  FillRounded(NSMakeRect(934, 204, 158, 48), 24, pulseColor);
  DrawText(@"demo.mp4", 980, 218, 96, 24, 16, [NSColor whiteColor], YES);

  DrawText(@"citation-context:5:6: deterministic audit packet", 88, 92, 520, 24, 16, Color(100, 92, 82), NO);

  [NSGraphicsContext restoreGraphicsState];
}

static BOOL AppendFrame(AVAssetWriterInputPixelBufferAdaptor *adaptor, CMTime time, NSInteger frameIndex) {
  CVPixelBufferRef pixelBuffer = NULL;
  CVReturn result = CVPixelBufferPoolCreatePixelBuffer(NULL, adaptor.pixelBufferPool, &pixelBuffer);
  if (result != kCVReturnSuccess || pixelBuffer == NULL) {
    return NO;
  }

  CVPixelBufferLockBaseAddress(pixelBuffer, 0);
  void *baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer);
  size_t bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer);
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef bitmapContext = CGBitmapContextCreate(baseAddress, FrameWidth, FrameHeight, 8, bytesPerRow, colorSpace, kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Host);

  DrawFrame(bitmapContext, frameIndex);

  CGContextRelease(bitmapContext);
  CGColorSpaceRelease(colorSpace);
  CVPixelBufferUnlockBaseAddress(pixelBuffer, 0);

  BOOL appended = [adaptor appendPixelBuffer:pixelBuffer withPresentationTime:time];
  CVPixelBufferRelease(pixelBuffer);
  return appended;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: render-demo-video output.mp4\n");
      return 1;
    }

    NSString *outputPath = [NSString stringWithUTF8String:argv[1]];
    NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
    [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];

    NSError *error = nil;
    AVAssetWriter *writer = [[AVAssetWriter alloc] initWithURL:outputURL fileType:AVFileTypeMPEG4 error:&error];
    if (!writer) {
      fprintf(stderr, "failed to create writer: %s\n", error.localizedDescription.UTF8String);
      return 1;
    }

    NSDictionary *settings = @{
      AVVideoCodecKey: AVVideoCodecTypeH264,
      AVVideoWidthKey: @(FrameWidth),
      AVVideoHeightKey: @(FrameHeight),
      AVVideoCompressionPropertiesKey: @{
        AVVideoAverageBitRateKey: @(1800000)
      }
    };
    AVAssetWriterInput *input = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:settings];
    input.expectsMediaDataInRealTime = NO;

    NSDictionary *attributes = @{
      (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
      (NSString *)kCVPixelBufferWidthKey: @(FrameWidth),
      (NSString *)kCVPixelBufferHeightKey: @(FrameHeight)
    };
    AVAssetWriterInputPixelBufferAdaptor *adaptor = [AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:attributes];

    if (![writer canAddInput:input]) {
      fprintf(stderr, "writer cannot add video input\n");
      return 1;
    }
    [writer addInput:input];

    [writer startWriting];
    [writer startSessionAtSourceTime:kCMTimeZero];

    for (NSInteger frame = 0; frame < TotalFrames; frame++) {
      while (!input.readyForMoreMediaData) {
        [NSThread sleepForTimeInterval:0.01];
      }
      CMTime time = CMTimeMake(frame, FramesPerSecond);
      if (!AppendFrame(adaptor, time, frame)) {
        fprintf(stderr, "failed to append frame %ld\n", (long)frame);
        return 1;
      }
    }

    [input markAsFinished];
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    [writer finishWritingWithCompletionHandler:^{
      dispatch_semaphore_signal(semaphore);
    }];
    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

    if (writer.status != AVAssetWriterStatusCompleted) {
      fprintf(stderr, "failed to write video: %s\n", writer.error.localizedDescription.UTF8String);
      return 1;
    }

    printf("wrote %s\n", outputPath.UTF8String);
  }
  return 0;
}

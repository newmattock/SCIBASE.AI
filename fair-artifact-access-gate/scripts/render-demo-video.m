#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>

static void FillRounded(NSRect rect, CGFloat radius, NSColor *color) {
  NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:radius yRadius:radius];
  [color setFill];
  [path fill];
}

static void StrokeRounded(NSRect rect, CGFloat radius, NSColor *color) {
  NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:radius yRadius:radius];
  [color setStroke];
  [path setLineWidth:2.0];
  [path stroke];
}

static void DrawText(NSString *text, NSRect rect, CGFloat size, NSColor *color, NSFontWeight weight) {
  NSMutableParagraphStyle *style = [[NSMutableParagraphStyle alloc] init];
  style.lineBreakMode = NSLineBreakByWordWrapping;
  NSDictionary *attrs = @{
    NSFontAttributeName: [NSFont systemFontOfSize:size weight:weight],
    NSForegroundColorAttributeName: color,
    NSParagraphStyleAttributeName: style
  };
  [text drawInRect:rect withAttributes:attrs];
}

static NSColor *RGB(CGFloat r, CGFloat g, CGFloat b) {
  return [NSColor colorWithCalibratedRed:r / 255.0 green:g / 255.0 blue:b / 255.0 alpha:1.0];
}

static void DrawCard(NSString *title, NSArray<NSString *> *lines, NSRect rect, NSColor *fill, NSColor *stroke, NSColor *titleColor, NSColor *bodyColor) {
  FillRounded(rect, 14.0, fill);
  StrokeRounded(rect, 14.0, stroke);
  DrawText(title, NSMakeRect(rect.origin.x + 22, rect.origin.y + rect.size.height - 56, rect.size.width - 44, 30), 22, titleColor, NSFontWeightBold);
  for (NSUInteger i = 0; i < lines.count; i++) {
    DrawText(lines[i], NSMakeRect(rect.origin.x + 22, rect.origin.y + rect.size.height - 96 - (CGFloat)i * 31, rect.size.width - 44, 28), 18, bodyColor, NSFontWeightRegular);
  }
}

static void DrawFrame(CGContextRef cg, int width, int height, int frame) {
  [NSGraphicsContext saveGraphicsState];
  NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithCGContext:cg flipped:NO];
  [NSGraphicsContext setCurrentContext:context];

  [[NSColor colorWithCalibratedRed:245.0 / 255.0 green:247.0 / 255.0 blue:249.0 / 255.0 alpha:1.0] setFill];
  NSRectFill(NSMakeRect(0, 0, width, height));

  FillRounded(NSMakeRect(64, 54, 1152, 612), 18, [NSColor whiteColor]);
  StrokeRounded(NSMakeRect(64, 54, 1152, 612), 18, RGB(207, 216, 223));

  CGFloat progress = MIN(1.0, MAX(0.0, ((CGFloat)frame - 8.0) / 64.0));
  DrawText(@"FAIR Artifact Access Gate", NSMakeRect(104, 595, 760, 48), 36, RGB(23, 33, 43), NSFontWeightBold);
  DrawText(@"Scientific data and code hosting readiness for SCIBASE issue #14", NSMakeRect(104, 563, 820, 28), 18, RGB(82, 99, 113), NSFontWeightRegular);

  DrawCard(@"Metadata Standards", @[@"JSON-LD", @"DataCite", @"schema.org"], NSMakeRect(104, 362, 252, 152), RGB(233, 246, 240), RGB(159, 208, 186), RGB(23, 72, 49), RGB(39, 99, 74));
  DrawCard(@"FAIR Signals", @[@"Findable", @"Accessible", @"Reusable"], NSMakeRect(386, 362, 252, 152), RGB(237, 242, 251), RGB(171, 192, 231), RGB(32, 60, 105), RGB(49, 85, 143));
  DrawCard(@"Access Policy", @[@"Public links", @"Reviewer URLs", @"Restriction reasons"], NSMakeRect(668, 362, 252, 152), RGB(255, 246, 223), RGB(228, 195, 109), RGB(106, 77, 7), RGB(122, 92, 17));
  DrawCard(@"Export Packet", @[@"Metadata", @"Manifest", @"Checksums"], NSMakeRect(950, 362, 226, 152), RGB(248, 237, 247), RGB(213, 171, 208), RGB(90, 40, 84), RGB(115, 56, 107));

  FillRounded(NSMakeRect(104, 136, 1072, 174), 14, RGB(23, 33, 43));
  DrawText(@"Astrocyte Calcium Imaging Atlas", NSMakeRect(132, 250, 700, 34), 24, [NSColor whiteColor], NSFontWeightBold);
  DrawText(@"6 artifact families: dataset, notebook, code, figure, raw instrument output, model", NSMakeRect(132, 209, 920, 28), 18, RGB(200, 211, 220), NSFontWeightRegular);
  DrawText(@"Ready: standards pass, FAIR pass, restricted reviewer export pass", NSMakeRect(132, 172, 820, 28), 18, RGB(200, 211, 220), NSFontWeightRegular);
  DrawText(@"Deterministic packet hash supports reviewer and collaborator handoff", NSMakeRect(132, 135, 820, 28), 18, RGB(200, 211, 220), NSFontWeightRegular);

  CGFloat barWidth = 980.0 * progress;
  FillRounded(NSMakeRect(132, 93, barWidth, 10), 5, RGB(64, 175, 120));
  DrawText(@"reviewer packet ready", NSMakeRect(132 + barWidth + 14, 84, 220, 28), 14, RGB(82, 99, 113), NSFontWeightMedium);

  [NSGraphicsContext restoreGraphicsState];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: render-demo-video output.mp4\n");
      return 2;
    }

    NSString *outputPath = [NSString stringWithUTF8String:argv[1]];
    NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
    [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];

    const int width = 1280;
    const int height = 720;
    NSError *error = nil;
    AVAssetWriter *writer = [[AVAssetWriter alloc] initWithURL:outputURL fileType:AVFileTypeMPEG4 error:&error];
    if (!writer) {
      NSLog(@"writer error: %@", error);
      return 1;
    }

    NSDictionary *videoSettings = @{
      AVVideoCodecKey: AVVideoCodecTypeH264,
      AVVideoWidthKey: @(width),
      AVVideoHeightKey: @(height)
    };
    AVAssetWriterInput *input = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:videoSettings];
    input.expectsMediaDataInRealTime = NO;

    NSDictionary *pixelBufferAttributes = @{
      (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32ARGB),
      (NSString *)kCVPixelBufferWidthKey: @(width),
      (NSString *)kCVPixelBufferHeightKey: @(height)
    };
    AVAssetWriterInputPixelBufferAdaptor *adaptor = [AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:pixelBufferAttributes];

    if (![writer canAddInput:input]) {
      NSLog(@"cannot add writer input");
      return 1;
    }
    [writer addInput:input];
    [writer startWriting];
    [writer startSessionAtSourceTime:kCMTimeZero];

    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    for (int frame = 0; frame < 96; frame++) {
      while (!input.readyForMoreMediaData) {
        [NSThread sleepForTimeInterval:0.01];
      }

      CVPixelBufferRef buffer = NULL;
      CVPixelBufferPoolCreatePixelBuffer(NULL, adaptor.pixelBufferPool, &buffer);
      CVPixelBufferLockBaseAddress(buffer, 0);
      void *baseAddress = CVPixelBufferGetBaseAddress(buffer);
      size_t bytesPerRow = CVPixelBufferGetBytesPerRow(buffer);
      CGContextRef cg = CGBitmapContextCreate(baseAddress, width, height, 8, bytesPerRow, colorSpace, kCGImageAlphaNoneSkipFirst);
      DrawFrame(cg, width, height, frame);
      CGContextRelease(cg);
      CVPixelBufferUnlockBaseAddress(buffer, 0);

      CMTime presentationTime = CMTimeMake(frame, 24);
      [adaptor appendPixelBuffer:buffer withPresentationTime:presentationTime];
      CVPixelBufferRelease(buffer);
    }

    CGColorSpaceRelease(colorSpace);
    [input markAsFinished];

    dispatch_semaphore_t sema = dispatch_semaphore_create(0);
    [writer finishWritingWithCompletionHandler:^{
      dispatch_semaphore_signal(sema);
    }];
    dispatch_semaphore_wait(sema, DISPATCH_TIME_FOREVER);

    if (writer.status != AVAssetWriterStatusCompleted) {
      NSLog(@"writer failed: %@", writer.error);
      return 1;
    }
  }

  return 0;
}

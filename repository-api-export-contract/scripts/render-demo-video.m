#import <AVFoundation/AVFoundation.h>
#import <AppKit/AppKit.h>

static NSDictionary *textAttrs(CGFloat size, NSColor *color, BOOL bold) {
  NSFont *font = bold ? [NSFont boldSystemFontOfSize:size] : [NSFont systemFontOfSize:size];
  return @{NSFontAttributeName: font, NSForegroundColorAttributeName: color};
}

static void fillRound(NSRect rect, CGFloat radius, NSColor *fill, NSColor *stroke) {
  NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:radius yRadius:radius];
  [fill setFill];
  [path fill];
  if (stroke) {
    [stroke setStroke];
    [path setLineWidth:2.0];
    [path stroke];
  }
}

static void drawText(NSString *text, CGFloat x, CGFloat y, CGFloat width, CGFloat size, NSColor *color, BOOL bold) {
  [text drawInRect:NSMakeRect(x, y, width, size + 12.0) withAttributes:textAttrs(size, color, bold)];
}

static void drawFrame(CGContextRef context, int frame, int totalFrames) {
  CGFloat t = (CGFloat)frame / (CGFloat)(totalFrames - 1);
  int stage = MIN(3, (int)floor(t * 4.0));

  NSGraphicsContext *graphicsContext = [NSGraphicsContext graphicsContextWithCGContext:context flipped:NO];
  [NSGraphicsContext saveGraphicsState];
  [NSGraphicsContext setCurrentContext:graphicsContext];

  [[NSColor colorWithCalibratedRed:0.06 green:0.09 blue:0.16 alpha:1.0] setFill];
  NSRectFill(NSMakeRect(0, 0, 1280, 720));
  fillRound(NSMakeRect(64, 56, 1152, 608), 12, [NSColor colorWithCalibratedWhite:0.98 alpha:1.0], nil);

  drawText(@"Repository API Export Contract", 104, 594, 900, 34, [NSColor colorWithCalibratedWhite:0.07 alpha:1.0], YES);
  drawText(@"Programmatic access and export-bundle readiness for SCIBASE project repositories", 104, 558, 960, 18, [NSColor colorWithCalibratedRed:0.28 green:0.33 blue:0.41 alpha:1.0], NO);

  NSArray *cards = @[
    @{@"title": @"1. Manifest", @"body": @"Required repository components and deterministic content hashes", @"detail": @"manuscript, data, code, notebooks, results, protocols, metadata", @"rect": [NSValue valueWithRect:NSMakeRect(104, 366, 500, 150)], @"fill": @[@0.88, @0.96, @0.99], @"stroke": @[@0.01, @0.52, @0.78]},
    @{@"title": @"2. REST API", @"body": @"Public GET, POST, and PUT routes with scoped access", @"detail": @"export route carries the manifest integrity root", @"rect": [NSValue valueWithRect:NSMakeRect(676, 366, 500, 150)], @"fill": @[@0.86, @0.99, @0.91], @"stroke": @[@0.09, @0.64, @0.29]},
    @{@"title": @"3. Export Bundle", @"body": @"Manifest, API contract, runbook, citation metadata, and files", @"detail": @"ordered entries sign a reproducible bundle hash", @"rect": [NSValue valueWithRect:NSMakeRect(104, 160, 500, 150)], @"fill": @[@1.0, @0.95, @0.78], @"stroke": @[@0.85, @0.47, @0.02]},
    @{@"title": @"4. CLI Workflow", @"body": @"clone, status, export, and route discovery commands", @"detail": @"Git-compatible automation for lab users", @"rect": [NSValue valueWithRect:NSMakeRect(676, 160, 500, 150)], @"fill": @[@0.95, @0.91, @1.0], @"stroke": @[@0.58, @0.20, @0.92]},
  ];

  for (NSUInteger i = 0; i < [cards count]; i++) {
    NSDictionary *card = cards[i];
    NSRect rect = [card[@"rect"] rectValue];
    NSArray *fill = card[@"fill"];
    NSArray *stroke = card[@"stroke"];
    NSColor *fillColor = [NSColor colorWithCalibratedRed:[fill[0] doubleValue] green:[fill[1] doubleValue] blue:[fill[2] doubleValue] alpha:1.0];
    NSColor *strokeColor = [NSColor colorWithCalibratedRed:[stroke[0] doubleValue] green:[stroke[1] doubleValue] blue:[stroke[2] doubleValue] alpha:1.0];
    fillRound(rect, 10, fillColor, strokeColor);
    if ((int)i == stage) {
      NSBezierPath *highlight = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(rect, -8, -8) xRadius:14 yRadius:14];
      [[NSColor colorWithCalibratedRed:0.10 green:0.45 blue:0.90 alpha:0.28] setFill];
      [highlight fill];
    }
    drawText(card[@"title"], rect.origin.x + 28, rect.origin.y + 108, 420, 24, strokeColor, YES);
    drawText(card[@"body"], rect.origin.x + 28, rect.origin.y + 70, 430, 17, [NSColor colorWithCalibratedWhite:0.08 alpha:1.0], NO);
    drawText(card[@"detail"], rect.origin.x + 28, rect.origin.y + 38, 430, 15, [NSColor colorWithCalibratedRed:0.30 green:0.35 blue:0.43 alpha:1.0], NO);
  }

  NSString *footer = [NSString stringWithFormat:@"ready=true  entries=13  api=GET,POST,PUT  bundle=sha256:cfa0be77...818c  frame=%d/%d", frame + 1, totalFrames];
  drawText(footer, 104, 90, 1000, 18, [NSColor colorWithCalibratedRed:0.20 green:0.25 blue:0.33 alpha:1.0], NO);

  [NSGraphicsContext restoreGraphicsState];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *output = argc > 1 ? [NSString stringWithUTF8String:argv[1]] : @"docs/demo.mp4";
    NSURL *outputURL = [NSURL fileURLWithPath:output];
    [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];

    NSError *error = nil;
    AVAssetWriter *writer = [[AVAssetWriter alloc] initWithURL:outputURL fileType:AVFileTypeMPEG4 error:&error];
    if (!writer) {
      NSLog(@"failed to create writer: %@", error);
      return 1;
    }

    NSDictionary *settings = @{
      AVVideoCodecKey: AVVideoCodecTypeH264,
      AVVideoWidthKey: @1280,
      AVVideoHeightKey: @720,
      AVVideoCompressionPropertiesKey: @{AVVideoAverageBitRateKey: @2500000}
    };
    AVAssetWriterInput *input = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:settings];
    input.expectsMediaDataInRealTime = NO;
    NSDictionary *attributes = @{
      (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32ARGB),
      (NSString *)kCVPixelBufferWidthKey: @1280,
      (NSString *)kCVPixelBufferHeightKey: @720,
    };
    AVAssetWriterInputPixelBufferAdaptor *adaptor = [AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:attributes];
    [writer addInput:input];
    [writer startWriting];
    [writer startSessionAtSourceTime:kCMTimeZero];

    const int fps = 24;
    const int totalFrames = 96;
    for (int frame = 0; frame < totalFrames; frame++) {
      while (!input.readyForMoreMediaData) {
        [NSThread sleepForTimeInterval:0.01];
      }
      CVPixelBufferRef pixelBuffer = NULL;
      CVPixelBufferPoolCreatePixelBuffer(NULL, adaptor.pixelBufferPool, &pixelBuffer);
      CVPixelBufferLockBaseAddress(pixelBuffer, 0);
      CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
      CGContextRef context = CGBitmapContextCreate(CVPixelBufferGetBaseAddress(pixelBuffer), 1280, 720, 8, CVPixelBufferGetBytesPerRow(pixelBuffer), colorSpace, kCGImageAlphaPremultipliedFirst);
      drawFrame(context, frame, totalFrames);
      CGContextRelease(context);
      CGColorSpaceRelease(colorSpace);
      CVPixelBufferUnlockBaseAddress(pixelBuffer, 0);
      [adaptor appendPixelBuffer:pixelBuffer withPresentationTime:CMTimeMake(frame, fps)];
      CVPixelBufferRelease(pixelBuffer);
    }

    [input markAsFinished];
    [writer finishWritingWithCompletionHandler:^{}];
    while (writer.status == AVAssetWriterStatusWriting) {
      [NSThread sleepForTimeInterval:0.05];
    }
    if (writer.status != AVAssetWriterStatusCompleted) {
      NSLog(@"writer failed: %@", writer.error);
      return 1;
    }
  }
  return 0;
}

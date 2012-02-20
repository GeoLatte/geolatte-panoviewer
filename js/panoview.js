/*
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Copyright (c) 2012, Geovise BVBA

*/


/* Author: Karel Maesen, Geovise BVBA */


var PanoViewer = function() {
	var self = {
		ZOOM_STEP : 0.2,		//default zoom-step for mouse wheel events.
		viewContext : null, 	//the 2D context for the images
		viewElement : null, 	//HTML element for the canvas.
		img : null, 			// image source for the panorama
		pov : {yaw: 0.0, 		//view angle in horizontal plane 
				 pitch: 0.0, 	//view angle in vertical plane
				 zoom: 1.0, 	//zoom factor
				 },		
		imageInfo:{},		
		listeners: {
			'view-update':[],
			'image-load':[]
		},		
		init: function(canvas) {
			//create the canvas context
			this.viewElement = canvas;
			if (canvas.getContext){			
		 		this.viewContext = canvas.getContext('2d');		 		
			} 		
			
			//register the mouse event handler			
			canvas.addEventListener('mousedown', self.onMouseDown, false);
			canvas.addEventListener('mousewheel', self.onScroll, false);
			//for FF
			canvas.addEventListener('DOMMouseScroll', self.onScroll, false);
			
		},
		hFov : function() {
			return (self.viewElement.width* self.imageInfo.xResolution)/self.pov.zoom; 
		},
		vFov : function() {
			return (self.viewElement.height*self.imageInfo.yResolution)/self.pov.zoom;
		},							 
		loadImageSrc : function(url, pov){
			this.img = new Image();
			this.img.src = url;						
			this.img.addEventListener('load', function(){
				//notify listeners that image is loaded
				self.fireEvent('image-load');												
				if (pov) {
					self.copyPov(pov, self.pov);
				}			
				self.initImageInfo(this);																										
				self.drawImage();					
				}, false); 		
		},
		initImageInfo : function(imageSrc){
			self.imageInfo.width = imageSrc.naturalWidth;
			self.imageInfo.height = imageSrc.naturalHeight;
			self.imageInfo.xResolution = 360 / self.imageInfo.width;
			self.imageInfo.yResolution = 180 / self.imageInfo.height;
		},
		drawImage : function(){						
			var sourceTopLeft = self.getSourceTopLeft();
			//TODO  -- improve documentation.			
			//calculate the image parts			  			
			var srcHeight = self.viewElement.height / self.pov.zoom;
			var srcWidth = self.viewElement.width / self.pov.zoom;
			var w1, w2; 
			// invariants : srcWidth == w1 + w2 ; self.viewelement.width == canvasW1 + canvasW2  
			if ( (sourceTopLeft[0] + srcWidth ) <= self.imageInfo.width) {
				w1 = srcWidth;				
				w2 =0;
			} else {
					//the view-port wraps around to the left-side of the panorama image.
					w1 = self.imageInfo.width - sourceTopLeft[0]; 
					w2 = srcWidth - w1; 		
			}			
			var canvasW1 = w1 * self.pov.zoom;
			var canvasW2 = w2 * self.pov.zoom;
									
			self.viewContext.drawImage(self.img, 
					sourceTopLeft[0], sourceTopLeft[1], w1, srcHeight, 
					0,0, canvasW1, self.viewElement.height);
					
		   if (w2 >  0) { // in case of wrap-around
				self.viewContext.drawImage(self.img, 
						0, sourceTopLeft[1], w2, srcHeight, 
						canvasW1,0, canvasW2, self.viewElement.height);
			}							
			self.fireEvent('view-update', {yaw :self.pov.yaw, 
													 pitch: self.pov.pitch, 
													 zoom: self.pov.zoom, 
													 hFov: self.hFov(),
													 vFov: self.vFov()});							
		},
		fireEvent: function(typeEvent, ev){
			var i = self.listeners[typeEvent].length;
			while(i--){
				self.listeners[typeEvent][i].call(self, ev);
			}
		},
		getSourceTopLeft : function(){					
			var leftEdgeYaw = self.normalizeX(self.pov.yaw - self.hFov()/2);						
			var sx = (leftEdgeYaw + 180)/self.imageInfo.xResolution;	
			var topEdgePitch = self.pov.pitch + self.vFov()/2;
			var sy = (90 - topEdgePitch)/self.imageInfo.yResolution; 
			return [sx,sy];
		},
		setPov : function(newPov) {
			self.copyPov(newPov, self.pov); 
			self.drawImage();				
		},
		copyPov : function(srcPov, destPov){
			if (srcPov.yaw) destPov.yaw =  self.normalizeX(srcPov.yaw);
			if (srcPov.pitch) destPov.pitch = self.clampY(srcPov.pitch); 
			if (srcPov.zoom) destPov.zoom = srcPov.zoom;
		},				
		on : function(ev, listener){ //registers eventlisteners
			self.listeners[ev].push(listener);
		},
		onMouseDown : function(ev){
			ev.preventDefault();													
			var panStart = {x : ev.clientX, y: ev.clientY};
			var povStart = {yaw : self.pov.yaw, pitch : self.pov.pitch};
			var moveHandler = function(ev) {
				ev.preventDefault();
				var dyaw = (ev.clientX - panStart.x)*self.currentDegreesPerPixelX();
				var dpitch = (ev.clientY - panStart.y)*self.currentDegreesPerPixelY();
				self.pov.yaw = self.normalizeX(povStart.yaw - dyaw);
				self.pov.pitch = self.clampY(povStart.pitch + dpitch);
				self.drawImage();			
			};
			var removeListener = function(){
				ev.preventDefault();
				self.viewElement.removeEventListener('mousemove', moveHandler, false);
			};
			self.viewElement.addEventListener('mousemove', moveHandler, false);
			self.viewElement.addEventListener('mouseout', removeListener, false);
			self.viewElement.addEventListener('mouseup', removeListener, false); 
							
		},
		onScroll: function(ev){
			ev.preventDefault();
			var inc = self.wheelEventSteps(ev);	
			//each zoom_step is a ZOOM_STEP% magnification (default: 20%).							
			var zoom = self.zoomClamp(self.pov.zoom * (1 + inc * self.ZOOM_STEP));
			self.setPov({zoom: zoom});			
		},
   	getCursorPosition : function(e){
			var x;
			var y;
			if (e.pageX || e.pageY){
				x = e.pageX;
				y = e.pageY;
			} else {
				x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
				y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;			
			}		
			x -= self.viewElement.offsetLeft;
			y -= self.viewElement.offsetTop;
			return { x : x, y : y };	
		},
		//Ensures that all x-values are within [-180, 180] 
		//but allows full rotation around panorama.  
		normalizeX : function(x){ 
			if (x < -180) return 360 + x;
			if (x > 180) return x - 360;
			return x;
		},
		currentDegreesPerPixelX : function(){
			return self.imageInfo.xResolution/self.pov.zoom;			 	
		},
		currentDegreesPerPixelY : function(){
			return self.imageInfo.yResolution/self.pov.zoom;
		},
		//Ensures that all y-values are clamped so 
		//that the view-port never exceeds [-90,90]
		clampY : function(y){
			var maxAngle = 90 - self.vFov()/2;
			if (y < -maxAngle) return -maxAngle;
			if (y > maxAngle) return maxAngle;
			return y;
		},
		zoomClamp : function(zoom) {
			var minZoomX = self.viewElement.width/self.imageInfo.width;
			var minZoomY = self.viewElement.height/self.imageInfo.height;
			var minZoom = Math.max(minZoomX, minZoomY); 
			if (zoom < minZoom) return minZoom;
			if (zoom > 10) return 10;
			return zoom;
		},
		wheelEventSteps : function(ev){
			if (ev.type == 'DOMMouseScroll') { //FF
				return ev.detail / 3.0;
			}
			return ev.wheelDelta / 120.0;	
		}			
	};
	return self;
}


	


























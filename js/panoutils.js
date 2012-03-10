/*
An mixin function. Mixes all properties/methods of the second to last argument objects into the
first argument object.
*/
function panoMixin(){
   var arg, prop;
   var destination = arguments[0];
   for (arg = 1; arg < arguments.length; arg += 1){
      for (prop in arguments[arg]){
         if (arguments[arg].hasOwnProperty(prop)){
            destination[prop] = arguments[arg][prop];
         }
      }
   }
}

function PanoEvents(/* array of event types (as strings)*/ eventTypes) {
   var eventType, idx;
   //create a map with event name as key and an array of listeners as value
   var listeners = {};
   for ( idx = 0; idx < eventTypes.length; idx += 1){
      eventType = eventTypes[idx];
      listeners[eventType] = [];
   }
   return {
     /* Registers the event listener for event type ev. */
     on : function (ev, listener) {
            listeners[ev].push(listener);
     },
     /* fires the event listeners for event type ev. */
     fireEvent: function (typeEvent, ev) {
            var i = listeners[typeEvent].length;
            while(i--){
                listeners[typeEvent][i].call(this, ev);
            }
      }
   };
}

function PanoXYZPositioner (viewer1, pos1, viewer2, pos2){

   var EPSILON = Math.PI * 0.25 / 180; //minimum of 0.25 degrees angle between the lines
   var toRadians = function(degrees){
   return Math.PI * degrees / 180;
   };
   var findIntersection2D = function(p0, d0, p1, d1){
      var e,s, t, sqrKross, kross, sqrLen0, sqrLen1;
      e = {x : p1.x - p0.x, y: p1.y - p0.y};
      kross = d0.x * d1.y - d0.y*d1.x;
      //var sqrLen0 = d0.x*d0.x + d0.y*d0.y; === garuanteed to be 1
      //var sqrLen1 = d1.x*d1.x + d1.y*d1.y;
      sqrKross = kross*kross;
      if (sqrKross > EPSILON) {
         s = (e.x * d1.y - e.y*d1.x) / kross;
         t = (e.x * d0.y - e.y*d0.x) / kross;
         if (s > 0 && t > 0) {
            return {x: p0.x + s*d0.x, y: p0.y + s*d0.y, s: s, t: t};
         }
      }
      return null;
   };
   var createListener = function(viewer){
      return function(bearing){
         if(viewer === viewers[0]) {
            positions[0].yaw = bearing.yaw;
            positions[0].pitch = bearing.pitch;
         } else if (viewer === viewers[1]){
            positions[1].yaw = bearing.yaw;
            positions[1].pitch = bearing.pitch;
         }
         self.updateIntersection();
      }
   };
   viewer1.on('bearing-registered', createListener(viewer1));
   viewer2.on('bearing-registered', createListener(viewer2));

   var viewers = [];
   var positions = [];
   viewers.push(viewer1);
   viewers.push(viewer2);
   positions.push(pos1);
   positions.push(pos2);
   var self;
   self = {
      intersection: null,
      updateIntersection: function(){
         if (!positions[0].yaw || !positions[1].yaw) return;
         var p0 = positions[0];
         var d0 = {x: Math.sin(toRadians(positions[0].yaw)),
                   y: Math.cos(toRadians(positions[0].yaw))};
         var p1 = positions[1];
         var d1 = {x: Math.sin(toRadians(positions[1].yaw)),
                   y: Math.cos(toRadians(positions[1].yaw))};
         var intersection = findIntersection2D(p0, d0, p1, d1);
         if (!intersection) {
            self.fireEvent('intersection-updated',null);
            return;
         }
         //calculate the Z value from s and t (average)
         var dz1 = intersection.t*Math.tan(toRadians(positions[0].pitch));
         var dz2 = intersection.s*Math.tan(toRadians(positions[1].pitch));
         //NOTE: this assumes that the z-position, is the position of the camera!!
         var z1 = positions[0].z + dz1;
         var z2 = positions[1].z + dz2;
         self.fireEvent('intersection-updated', self.intersection ? self.intersection : {x: intersection.x, y: intersection.y, z: z1, altZ: z2});
      }
   };
   panoMixin(self, new PanoEvents(['intersection-updated']));
   return self;
}


/*
Symbolizes recording locations on a PanoViewer.
*/
function RecordingLocationsSymbolizer(/*a PanoViewer*/ viewer) {
    if (viewer == null) throw "Required viewer missing!";
    var self;    
    self = {
        recordingLocations: [],   //the locations of neighboring recordinglocations in {yaw, pitch, distance} relative to this recording location
        drawRecordingLocationOnPosition : function(pos, /*includes the camera view*/ inclCamera){
            var ctxt = viewer.canvasContext;
            var srcPixel = viewer.srcPixelFromBearing({yaw: pos.yaw, pitch: pos.pitchGL});
            var pixel = viewer.canvasPixel(srcPixel)
            ctxt.save();
            ctxt.globalAlpha = 0.2;
            ctxt.beginPath();
            // set the styles
            ctxt.strokeStyle = 'blue';
            ctxt.lineWidth = 1;
            ctxt.fillStyle = 'blue';
            //calculate the diameter r
            var dphi = 0.1; //radians!
            var r = 2*pos.distanceGL*Math.sin(dphi);
            ctxt.save();
            ctxt.scale(1,2);
            //TODO -- replace this with proper cylinder/plane intersection!!
            ctxt.arc(pixel.x, pixel.y/2, r*20*viewer.pov.zoom, 0, Math.PI*2, false);
            ctxt.stroke();
            ctxt.fill();
            ctxt.closePath();
            ctxt.restore();
            if (inclCamera) {
                var srcCameraPixel = viewer.srcPixelFromBearing({yaw: pos.yaw, pitch: pos.pitch});
                var canvasCameraPixel = viewer.canvasPixel(srcCameraPixel);
                var cameraR = 5 * viewer.pov.zoom; //camera symbol has 5px radius
                ctxt.beginPath();
                ctxt.moveTo(pixel.x, pixel.y);
                ctxt.lineTo(canvasCameraPixel.x, canvasCameraPixel.y+cameraR);
                ctxt.stroke();
                ctxt.closePath();
                ctxt.beginPath();
                ctxt.arc(canvasCameraPixel.x, canvasCameraPixel.y, cameraR, 0, Math.PI*2, false);
                ctxt.fill();
                ctxt.stroke();
                ctxt.closePath();
            }
            ctxt.restore();
        },
        setRecordingLocations: function(/*array of recording locations in x/y/z */locations){
            if (!viewer.currentRecordingLocation) return; // do nothing if we don't have the current recording location
            self.recordingLocations = [];
            for( var i = 0, max = locations.length; i < max; i++){                
                self.recordingLocations.push(locations[i]);
            }
        },
        drawRecordingLocations : function(){
            var i = self.recordingLocations.length;
            while (i--){
                var pos = self.toRelativePolar(viewer.currentRecordingLocation, self.recordingLocations[i]);
                self.drawRecordingLocationOnPosition(pos, true);
            }
        },
        //Converts the specified position to a position in polar coordinates (yaw, pitch, distance)
        // relative to the current recordinglocation
        toRelativePolar: function(origin, pos){
            var dx = pos.x - origin.x;
            var dy = pos.y - origin.y;
            var dz = pos.z - origin.z;
            var polar = {};
            polar.distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            polar.yaw = self.toDegrees(Math.atan2(dx,dy)); 
            polar.pitch = self.toDegrees(Math.asin(dz/polar.distance));
            //TODO -- move this to a proper location
            polar.pitchGL = self.toDegrees(Math.atan2(dz-viewer.CAMERA_HEIGHT, polar.distance*Math.cos(polar.pitch)));
            var dzgl = pos.z - (origin.z - viewer.CAMERA_HEIGHT);
            polar.distanceGL = Math.sqrt(dx*dx + dy*dy + dzgl*dzgl);
            return polar;
        }
        
    };
    //minxin utility
    panoMixin(self, new PanoTrigonometry());
    //link draw operation viewer event
    viewer.on('view-update', self.drawRecordingLocations);
    return self;
}

/*
 * Common utility methods 
 */ 
function PanoTrigonometry(){
    var self = {};
    self.toDegrees = function(radians) {
        return radians * 180 / Math.PI;
    };
    self.toRadians = function(degrees) {
        return degrees * Math.PI / 180;
    };
    return self;
}


/*
TODO:
 - viewers now have currentRecordingLocation property, so no need to pass it to PanoXYZPositioner constructor.
 - handle near parallel or non-intersecting half-lines better than returning a null object.
 - verify the meaning of the z-coordinate (coordinate of the camera?)
*/

<template>
  <div style="background-color: #111;">
    <v-img
      src="coding-1.jpg"
      style="height: 100vh;"
      gradient="rgba(0, 0, 0, 0.4),rgba(0, 0, 0, 0.4)"
    >
      <v-container
        fluid
        style="width: 100%; height: 100%; overflow-y: auto;"
        class="pa-12"
      >
        <v-row>
          <v-col cols="12" md="8">
            <v-row
              style="position: sticky; top: 10px"
            >
              <v-col
                cols="12"
                sm="10"
              >
                <h1 class="text-h4 text-md-h3 font-weight-medium white--text" style="line-height:1.5">
                  Ideas are cheap,
                  <br>
                  execution is everything.
                </h1>
              </v-col>
              <v-col cols="12" xs="0" sm="1" />
              <v-col cols="12" xs="0" sm="1" />
              <v-col
                cols="12"
                sm="10"
                lg="8"
              >
                <p class="text-body font-weight-normal white--text" style="line-height:1.5">
                  Execution can be an uphill battle.<br>We believe funding should come with the knowledge and experience
                  needed to build and scale a successful product.
                  <br><br>
                  That's why we formed CTO Roundtable Invest, to provide a combination of funding and experience that
                  we see as critical for startups. We're looking for early-stage companies to invest in.
                </p>
                <br>

                <h4 class="font-weight-normal text-body white--text">
                  Contact us at <a class="white--text" href="mailto:post@ctoroundtable.no">post@ctoroundtable.no</a>
                </h4>

                <br><br>
                <v-img
                  src="logo-white.svg"
                  style="max-width:240px;"
                />
              </v-col>
              <v-col cols="12" xs="0" sm="6" />
            </v-row>
          </v-col>

          <v-col cols="12" md="4">
            <h3 class="white--text text-center mt-10 mb-3">
              CTO Roundtable Investors
            </h3>
            <members />
          </v-col>
        </v-row>
      </v-container>
    </v-img>
  </div>
</template>

<script lang="ts">
import Members from '~/pages/members.vue'

export default {
  components: { Members }
}
</script>

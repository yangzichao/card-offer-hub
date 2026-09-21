@citi @browser @recovery
Feature: Stop cached Citi additions and continue remaining offers
  A clean stop must preserve the saved list and leave remaining offers usable.
  A request that never left the browser must not become unconfirmed.

  Background:
    Given a synthetic Citi page with the published userscript
    And I loaded offers and selected only card A

  Scenario: Stop before the next request leaves the browser
    When I click "Add saved offers"
    And I click "Stop"
    And the operation reports "Stopped"
    Then no new Citi requests have been sent
    And the "Add saved offers" button is enabled
    When I reload the page
    Then the "Add saved offers" button is enabled
    When I click "Add saved offers"
    And the operation reports "Finished: 2/2"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
      | card-a | b     |

  Scenario: Stop during an enrollment that is subsequently confirmed
    Given I will press Stop while the first enrollment is in flight
    When I click "Add saved offers"
    And the operation reports "Stopped"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
    And the "Add saved offers" button is enabled
    When I click "Add saved offers"
    And the operation reports "Finished: 1/1"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
      | card-a | b     |

  Scenario: Stop cannot clear an unconfirmed in-flight enrollment
    Given Citi will return an unconfirmed enrollment response
    And I will press Stop while the first enrollment is in flight
    When I click "Add saved offers"
    And the operation reports "not explicitly confirmed"
    Then the "Add saved offers" button is disabled
    And the disabled-action explanation contains "1 saved offer(s) have an unconfirmed add result"
    And exactly 1 enrollment request has been sent
